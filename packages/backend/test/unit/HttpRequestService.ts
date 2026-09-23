/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as http from 'node:http';
import * as net from 'node:net';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { SensitiveMediaDetectionService } from '@/core/SensitiveMediaDetectionService.js';
import type { Config } from '@/config.js';
import type { MiMeta } from '@/models/Meta.js';
import type { LoggerService } from '@/core/LoggerService.js';

/**
 * PR #424 は、既存の S3Service と同じく、管理者指定先への内部通信許可と Proxy 選択を独立させる要求。
 * 設定の継承と更新は判定要求へ適用し、Proxy 回避を共有状態にして他の要求の経路まで変えない。
 * multipart と応答の対応は sensitive-detector 842549b3174ba0caa5ea8368869a704f814d7459 の docs/api-detect-images.md に基づく。
 */
describe('センシティブ判定サービスへの HTTP 接続', () => {
	let target: http.Server;
	let proxy: http.Server;
	let targetUrl: string;
	let service: HttpRequestService;
	let proxyConnections: number;
	const requests: { path: string; authorization?: string; images: { content: string; type: string }[] }[] = [];
	const sockets = new Set<net.Socket>();
	const agents = new Set<http.Agent>();
	const predictions = {
		a: [{ className: 'safe', probability: 0.9 }, { className: 'nsfw', probability: 0.1 }],
		b: [{ className: 'safe', probability: 0.2 }, { className: 'nsfw', probability: 0.8 }],
		c: [{ className: 'safe', probability: 0.7 }, { className: 'nsfw', probability: 0.3 }],
	};

	function track(socket: net.Socket): void {
		sockets.add(socket);
		socket.on('error', () => {});
		socket.on('close', () => sockets.delete(socket));
	}

	async function listen(server: http.Server): Promise<number> {
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		return (server.address() as net.AddressInfo).port;
	}

	beforeEach(async () => {
		// test 環境では内部アドレスへの直接通信が制限されないため、production で検証する。
		vi.stubEnv('NODE_ENV', 'production');
		proxyConnections = 0;
		requests.length = 0;
		target = http.createServer(async (request, response) => {
			const received = { path: request.url!, authorization: request.headers.authorization, images: [] as { content: string; type: string }[] };
			requests.push(received);
			if (request.method !== 'POST') {
				response.end('detector reached');
				return;
			}
			if (request.url?.startsWith('/no-response/')) return;
			const chunks: Buffer[] = [];
			for await (const chunk of request) chunks.push(chunk);
			const body = new Response(Uint8Array.from(Buffer.concat(chunks)), { headers: { 'Content-Type': request.headers['content-type']! } });
			const form = await body.formData();
			for (const part of form.values()) {
				const image = part as File;
				received.images.push({ content: await image.text(), type: image.type });
			}
			response.setHeader('Content-Type', 'application/json');
			response.end(JSON.stringify({ success: true, result: { results: received.images.map(image => ({
				success: true, predictions: predictions[image.content as keyof typeof predictions],
			})) } }));
		});
		target.on('connection', track);
		targetUrl = `http://127.0.0.1:${await listen(target)}`;
		proxy = http.createServer();
		proxy.on('connection', track);
		proxy.on('connect', (_request, socket, head) => {
			proxyConnections++;
			const upstream = net.connect({ host: '127.0.0.1', port: Number(new URL(targetUrl).port) }, () => {
				socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
				upstream.write(head);
				socket.pipe(upstream);
				upstream.pipe(socket);
			});
			track(upstream);
		});
		service = new HttpRequestService({
			proxy: `http://127.0.0.1:${await listen(proxy)}`,
			userAgent: 'Misskey transport test',
		} as Config);
		for (const bypassProxy of [false, true]) {
			for (const isLocalAddressAllowed of [false, true]) {
				agents.add(service.getAgentByUrl(new URL(targetUrl), bypassProxy, isLocalAddressAllowed));
			}
		}
	});

	afterEach(async () => {
		for (const agent of agents) agent.destroy();
		agents.clear();
		for (const socket of sockets) socket.destroy();
		sockets.clear();
		await Promise.all([target, proxy].map(server => new Promise<void>((resolve) => server.close(() => resolve()))));
		vi.unstubAllEnvs();
	});

	function detector(sensitiveMediaDetection?: Config['sensitiveMediaDetection']) {
		const meta = {
			sensitiveMediaDetectionApiUrl: null,
			sensitiveMediaDetectionApiKey: null,
			sensitiveMediaDetectionUseProxy: null,
			sensitiveMediaDetectionTimeout: null,
			sensitiveMediaDetectionMaxImagesPerRequest: null,
		} as MiMeta;
		return {
			meta,
			detector: new SensitiveMediaDetectionService({ sensitiveMediaDetection } as Config, meta, service, {
				getLogger: () => ({ warn: vi.fn() }),
			} as unknown as LoggerService),
		};
	}

	test('内部サービスを直接呼び出しても後続の通常呼び出しは Proxy を使う', async () => {
		const direct = await service.send(targetUrl, { bypassProxy: true, isLocalAddressAllowed: true });
		expect(await direct.text()).toBe('detector reached');
		expect(proxyConnections).toBe(0);

		const ordinary = await service.send(targetUrl);
		expect(await ordinary.text()).toBe('detector reached');
		expect(proxyConnections).toBeGreaterThan(0);
	});

	test('private address の許可だけでは Proxy を回避しない', async () => {
		const response = await service.send(targetUrl, { isLocalAddressAllowed: true });
		expect(await response.text()).toBe('detector reached');
		expect(proxyConnections).toBeGreaterThan(0);
	});

	test('Proxy 回避だけでは private address への直接通信を許可しない', async () => {
		await expect(service.send(targetUrl, { bypassProxy: true })).rejects.toThrow();
		expect(requests).toHaveLength(0);
		expect(proxyConnections).toBe(0);
	});

	test('ファイルの接続先・キー・枚数上限・Proxy 設定で PNG 画像を送り、結果は入力順に返す', async () => {
		const client = detector({ apiUrl: `${targetUrl}/prefix`, apiKey: 'server-secret', maxImagesPerRequest: 2, useProxy: false });
		const result = await client.detector.detectSensitiveMany([Buffer.from('a'), Buffer.from('b'), Buffer.from('c')]);

		expect(result).toEqual([predictions.a, predictions.b, predictions.c]);
		expect(requests.length).toBeGreaterThan(0);
		for (const request of requests) {
			expect(request.path).toBe('/prefix/v1/detect-images');
			expect(request.authorization).toBe('Bearer server-secret');
			expect(request.images.length).toBeGreaterThan(0);
			expect(request.images.length).toBeLessThanOrEqual(2);
		}
		expect(requests.flatMap(request => request.images).sort((a, b) => a.content.localeCompare(b.content))).toEqual([
			{ content: 'a', type: 'image/png' }, { content: 'b', type: 'image/png' }, { content: 'c', type: 'image/png' },
		]);
		expect(proxyConnections).toBe(0);
	});

	test('保存されたキーと Proxy 設定の変更を次の判定要求から反映する', async () => {
		const client = detector({ apiUrl: targetUrl, apiKey: 'server-secret', useProxy: false });
		await client.detector.detectSensitive(Buffer.from('a'));
		expect(requests[0].authorization).toBe('Bearer server-secret');
		expect(proxyConnections).toBe(0);

		client.meta.sensitiveMediaDetectionApiKey = '';
		client.meta.sensitiveMediaDetectionUseProxy = true;
		await client.detector.detectSensitive(Buffer.from('b'));

		expect(requests[1].authorization).toBeUndefined();
		expect(proxyConnections).toBeGreaterThan(0);
	});

	test('キー未指定の判定要求は認証ヘッダーを送らず、既定の Proxy 経由で到達する', async () => {
		const client = detector({ apiUrl: targetUrl });
		expect(await client.detector.detectSensitive(Buffer.from('a'))).toEqual(predictions.a);
		expect(requests[0].authorization).toBeUndefined();
		expect(proxyConnections).toBeGreaterThan(0);
	});

	test('設定した時間まで応答がなければ検出不能を返す', async () => {
		const client = detector({ apiUrl: `${targetUrl}/no-response`, timeout: 200 });
		expect(await client.detector.detectSensitive(Buffer.from('a'))).toBeNull();
		expect(requests).toHaveLength(1);
	}, 5000);
});
