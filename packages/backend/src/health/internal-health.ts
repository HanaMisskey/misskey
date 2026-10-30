/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createServer } from 'node:http';
import type { Server } from 'node:http';

export function parseInternalHealthPort(raw: string | undefined, publicPort: number): number | undefined {
	if (raw === undefined) return undefined;
	const port = Number(raw);
	if (!/^[0-9]+$/.test(raw) || !Number.isInteger(port) || port < 1 || port > 65535 || port === publicPort) {
		throw new Error('Invalid internal health port');
	}
	return port;
}

export async function startInternalHealthServer(options: {
	port: number | undefined;
	isLive: () => boolean | Promise<boolean>;
	isStarted: () => boolean | Promise<boolean>;
}): Promise<Server | undefined> {
	if (options.port === undefined) return undefined;
	parseInternalHealthPort(String(options.port), -1);
	const server = createServer(async (request, response) => {
		response.setHeader('Cache-Control', 'no-store');
		response.setHeader('Content-Length', '0');
		if (request.method !== 'GET' && request.method !== 'HEAD') {
			response.writeHead(405).end();
			return;
		}
		const path = request.url?.split('?')[0];
		const predicate = path === '/livez' ? options.isLive : path === '/startupz' ? options.isStarted : undefined;
		if (!predicate) {
			response.writeHead(404).end();
			return;
		}
		try {
			response.writeHead(await predicate() ? 200 : 503).end();
		} catch {
			response.writeHead(503).end();
		}
	});
	server.on('checkExpectation', (_request, response) => {
		response.setHeader('Cache-Control', 'no-store');
		response.setHeader('Content-Length', '0');
		response.writeHead(417).end();
	});
	server.on('clientError', (_error, socket) => {
		socket.end('HTTP/1.1 400 Bad Request\r\nCache-Control: no-store\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
	});
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(options.port, '0.0.0.0', () => {
			server.off('error', reject);
			resolve();
		});
	});
	return server;
}
