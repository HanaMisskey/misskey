/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as http from 'node:http';
import * as net from 'node:net';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { SensitiveMediaDetectionService } from '@/core/SensitiveMediaDetectionService.js';
import type { Config } from '@/config.js';
import type { MiMeta } from '@/models/Meta.js';
import type { LoggerService } from '@/core/LoggerService.js';

/**
 * PR #424 ではファイルの接続設定を判定要求へ適用し、DB の空キーと Proxy 指定で上書きできる。
 * 内部通信許可と Proxy 選択は既存の S3Service に合わせる。実到達で接続設定の取り落としを検出する。
 */
describe('センシティブ判定サービスへの HTTP 接続', () => {
	const directory = mkdtempSync(join(tmpdir(), 'misskey-detector-config-'));
	const configFile = join(directory, 'test.yml');
	const baseConfig = readFileSync(new URL('../../../../.github/misskey/test.yml', import.meta.url), 'utf8');
	afterAll(() => rmSync(directory, { recursive: true, force: true }));
	let target: http.Server;
	let proxy: http.Server;
	let targetUrl: string;
	let httpRequestService: HttpRequestService;
	let proxyConnections: number;
	const requests: { path: string; authorization?: string }[] = [];
	const sockets = new Set<net.Socket>();
	const predictions = [{ className: 'safe', probability: 0.9 }, { className: 'nsfw', probability: 0.1 }];

	async function listen(server: http.Server): Promise<number> {
		server.on('connection', socket => sockets.add(socket));
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
		return (server.address() as net.AddressInfo).port;
	}

	beforeEach(async () => {
		// test 環境では内部アドレスへの直接通信が制限されないため、production で検証する。
		vi.stubEnv('NODE_ENV', 'production');
		proxyConnections = 0;
		requests.length = 0;
		target = http.createServer((request, response) => {
			requests.push({ path: request.url!, authorization: request.headers.authorization });
			request.resume();
			if (request.url?.startsWith('/no-response/')) return;
			response.setHeader('Content-Type', 'application/json');
			response.end(JSON.stringify({ success: true, result: { results: [{ success: true, predictions }] } }));
		});
		targetUrl = `http://127.0.0.1:${await listen(target)}`;
		proxy = http.createServer();
		proxy.on('connect', (_request, socket, head) => {
			proxyConnections++;
			const upstream = net.connect({ host: '127.0.0.1', port: Number(new URL(targetUrl).port) }, () => {
				socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
				upstream.write(head);
				socket.pipe(upstream).pipe(socket);
			});
			sockets.add(upstream);
		});
		httpRequestService = new HttpRequestService({ proxy: `http://127.0.0.1:${await listen(proxy)}` } as Config);
	});

	afterEach(async () => {
		for (const bypassProxy of [false, true]) httpRequestService.getAgentByUrl(new URL(targetUrl), bypassProxy, true).destroy();
		for (const socket of sockets) socket.destroy();
		sockets.clear();
		await Promise.all([target, proxy].map(server => new Promise<void>(resolve => server.close(() => resolve()))));
		vi.unstubAllEnvs();
	});

	async function makeService(config: Config['sensitiveMediaDetection'], meta = {} as MiMeta) {
		writeFileSync(configFile, `${baseConfig}\nsensitiveMediaDetection: ${JSON.stringify(config)}\n`);
		vi.stubEnv('MISSKEY_CONFIG_YML', configFile);
		const { loadConfig } = await import('@/config.js');
		return new SensitiveMediaDetectionService(loadConfig(), meta, httpRequestService, {
			getLogger: () => ({ warn: vi.fn() }),
		} as unknown as LoggerService);
	}

	test('ファイル指定の内部サービスへ接続し、DB の空キーと Proxy 利用への変更を反映する', async () => {
		const meta = {} as MiMeta;
		const service = await makeService({ apiUrl: `${targetUrl}/prefix`, apiKey: 'server-key', maxImagesPerRequest: 1, useProxy: false }, meta);
		expect(await service.detectSensitiveMany([Buffer.from('a'), Buffer.from('b')])).toEqual([predictions, predictions]);
		expect(requests).toEqual([
			{ path: '/prefix/v1/detect-images', authorization: 'Bearer server-key' },
			{ path: '/prefix/v1/detect-images', authorization: 'Bearer server-key' },
		]);
		expect(proxyConnections).toBe(0);

		meta.sensitiveMediaDetectionApiKey = '';
		meta.sensitiveMediaDetectionUseProxy = true;
		expect(await service.detectSensitive(Buffer.from('c'))).toEqual(predictions);
		expect(requests[2]).toEqual({ path: '/prefix/v1/detect-images', authorization: undefined });
		expect(proxyConnections).toBeGreaterThan(0);
	});

	test('ファイル指定の時間まで応答がなければ検出不能を返す', async () => {
		const service = await makeService({ apiUrl: `${targetUrl}/no-response`, apiKey: '', timeout: 200 });
		expect(await service.detectSensitive(Buffer.from('a'))).toBeNull();
		expect(requests).toEqual([{ path: '/no-response/v1/detect-images', authorization: undefined }]);
	}, 5000);
});
