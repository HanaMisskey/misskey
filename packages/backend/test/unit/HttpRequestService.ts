/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as http from 'node:http';
import * as net from 'node:net';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import type { Config } from '@/config.js';

describe('HttpRequestService.send', () => {
	let target: http.Server;
	let proxy: http.Server;
	let targetUrl: string;
	let service: HttpRequestService;
	let proxyConnections: number;
	const sockets = new Set<net.Socket>();
	const agents = new Set<http.Agent>();

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
		target = http.createServer((_request, response) => response.end('detector reached'));
		target.on('connection', track);
		targetUrl = `http://127.0.0.1:${await listen(target)}/v1/detect-images`;
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

	test('内部サービスを直接呼び出しても後続の通常呼び出しは Proxy を使う', async () => {
		const direct = await service.send(targetUrl, { bypassProxy: true, isLocalAddressAllowed: true });
		expect(await direct.text()).toBe('detector reached');
		expect(proxyConnections).toBe(0);

		const ordinary = await service.send(targetUrl);
		expect(await ordinary.text()).toBe('detector reached');
		expect(proxyConnections).toBe(1);
	});

	test('private address の許可だけでは Proxy を回避しない', async () => {
		const response = await service.send(targetUrl, { isLocalAddressAllowed: true });
		expect(await response.text()).toBe('detector reached');
		expect(proxyConnections).toBe(1);
	});

	test('Proxy 回避だけでは private address への直接通信を許可しない', async () => {
		await expect(service.send(targetUrl, { bypassProxy: true })).rejects.toThrow('Blocked address: 127.0.0.1');
		expect(proxyConnections).toBe(0);
	});
});
