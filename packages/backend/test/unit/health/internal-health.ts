/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createServer, request } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { connect } from 'node:net';
import { afterEach, describe, expect, test, vi } from 'vitest';

const servers: Server[] = [];
afterEach(async () => {
	await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
		server.close(error => error ? reject(error) : resolve());
		server.closeAllConnections();
	})));
});

async function explicitPort() {
	const reservation = createServer();
	await new Promise<void>(resolve => reservation.listen(0, '0.0.0.0', resolve));
	const port = (reservation.address() as AddressInfo).port;
	await new Promise<void>(resolve => reservation.close(() => resolve()));
	return port;
}

async function moduleUnderTest() {
	return import('@/health/internal-health.js');
}

async function start(isLive: () => boolean | Promise<boolean>, isStarted = isLive) {
	const { startInternalHealthServer } = await moduleUnderTest();
	const server = await startInternalHealthServer({ port: await explicitPort(), isLive, isStarted });
	expect(server).toBeDefined();
	servers.push(server!);
	const address = server!.address() as AddressInfo;
	expect(['0.0.0.0', '::']).toContain(address.address);
	return address.port;
}

function http(port: number, path: string, method = 'GET', headers: Record<string, string> = {}) {
	return new Promise<{ status: number; body: string; headers: Record<string, unknown> }>((resolve, reject) => {
		const req = request({ host: '127.0.0.1', port, path, method, headers }, res => {
			const chunks: Buffer[] = [];
			res.on('data', chunk => chunks.push(chunk));
			res.on('end', () => resolve({ status: res.statusCode!, body: Buffer.concat(chunks).toString(), headers: res.headers }));
		});
		req.setTimeout(1000, () => req.destroy(new Error('internal HTTP deadline exceeded')));
		req.on('error', reject);
		req.end();
	});
}

/** Oracle: README.md "Internal role probes" requires explicit decimal opt-in
 * in 1..65535, separate from the public application port.
 * No port is allocated for absent configuration; accepted leading zeroes remain decimal.
 */
describe('internal health port configuration', () => {
	test('absence disables without invoking role predicates', async () => {
		const { parseInternalHealthPort, startInternalHealthServer } = await moduleUnderTest();
		expect(parseInternalHealthPort(undefined, 3000)).toBeUndefined();
		const predicate = vi.fn(() => { throw new Error('must not read disabled role'); });
		expect(await startInternalHealthServer({ port: undefined, isLive: predicate, isStarted: predicate })).toBeUndefined();
		expect(predicate).not.toHaveBeenCalled();
	});

	test.each([['1', 1], ['3001', 3001], ['065535', 65535]] as const)('accepts decimal %s', async (raw, expected) => {
		const { parseInternalHealthPort } = await moduleUnderTest();
		expect(parseInternalHealthPort(raw, 3000)).toBe(expected);
	});

	test.each(['', '0', '-1', '+3001', ' 3001', '3001 ', '3e3', '0xbbb', '3001.0', '65536', 'NaN', '3001\n'])('rejects invalid explicit port %j', async raw => {
		const { parseInternalHealthPort } = await moduleUnderTest();
		expect(() => parseInternalHealthPort(raw, 3000)).toThrow();
	});

	test('rejects collision with the effective public listener', async () => {
		const { parseInternalHealthPort } = await moduleUnderTest();
		expect(() => parseInternalHealthPort('8080', 8080)).toThrow();
	});
});

/** Oracle: README.md "Internal role probes" requires empty/no-store responses
 * for every final HTTP outcome, including failures before the request handler.
 * This uses a real socket, including HEAD and bind conflict, rather than handler mocks.
 */
describe('internal role HTTP protocol', () => {
	test.each(['GET', 'HEAD'])('%s separates local startup from liveness and reflects changes', async method => {
		let live = true;
		let started = false;
		const port = await start(() => live, () => started);
		for (const [path, status] of [['/livez', 200], ['/startupz', 503]] as const) {
			const res = await http(port, path, method);
			expect(res.status).toBe(status);
			expect(res.body).toBe('');
			expect(res.headers['cache-control']).toBe('no-store');
		}
		started = true;
		live = false;
		expect((await http(port, '/startupz', method)).status).toBe(200);
		expect((await http(port, '/livez', method)).status).toBe(503);
	});

	test.each(['throw', 'reject'])('predicate %s remains an empty503 with no diagnostic headers', async failure => {
		const secret = 'database-password role=queue pid=123 worker=inbox';
		const predicate = () => {
			if (failure === 'throw') throw new Error(secret);
			return Promise.reject(new Error(secret));
		};
		const port = await start(predicate);
		for (const path of ['/livez', '/startupz', '/livez?verbose=true']) {
			const res = await http(port, path);
			expect(res.status).toBe(503);
			expect(res.body).toBe('');
			expect(res.headers['cache-control']).toBe('no-store');
			expect(JSON.stringify(res.headers)).not.toContain(secret);
			for (const header of Object.keys(res.headers)) expect(header).not.toMatch(/role|pid|worker|queue|exception|dependency|config/i);
		}
	});

	test.each([
		['GET', '/diagnostics', 404], ['GET', '/healthz', 404],
		['POST', '/livez', 405], ['OPTIONS', '/startupz', 405],
	] as const)('%s %s is empty and uncacheable', async (method, path, status) => {
		const predicate = vi.fn(() => true);
		const port = await start(predicate);
		const res = await http(port, path, method);
		expect(res).toMatchObject({ status, body: '' });
		expect(res.headers['cache-control']).toBe('no-store');
		expect(predicate).not.toHaveBeenCalled();
	});

	test('successful query cannot enable diagnostics', async () => {
		const port = await start(() => true);
		const res = await http(port, '/livez?verbose=true&details=1');
		expect(res).toMatchObject({ status: 200, body: '' });
		expect(res.headers['cache-control']).toBe('no-store');
	});

	test('an HTTP parser error is empty and uncacheable without diagnostic details', async () => {
		const port = await start(() => true);
		const wire = await new Promise<string>((resolve, reject) => {
			const socket = connect(port, '127.0.0.1');
			const chunks: Buffer[] = [];
			socket.setTimeout(1000, () => socket.destroy(new Error('parser response deadline exceeded')));
			socket.on('connect', () => socket.write('G ET /livez HTTP/1.1\r\nHost: local\r\n\r\n'));
			socket.on('data', chunk => chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk));
			socket.on('end', () => resolve(Buffer.concat(chunks).toString()));
			socket.on('error', reject);
		});
		const [headers, body] = wire.split('\r\n\r\n');
		expect(headers).toMatch(/^HTTP\/1\.1 400 /);
		expect(headers.toLowerCase()).toContain('cache-control: no-store');
		expect(body).toBe('');
		expect(headers).not.toMatch(/HPE_|Parse Error|worker|queue|pid|config|exception/i);
	});

	test.each([
		['unexpected', 417],
		['100-continue', 200],
	] as const)('Expect: %s keeps the final HTTP response empty and uncacheable', async (expectation, status) => {
		const port = await start(() => true);
		const res = await http(port, '/livez', 'GET', { Expect: expectation, 'Content-Length': '0' });
		expect(res.status).toBe(status);
		expect(res.body).toBe('');
		expect(res.headers['cache-control']).toBe('no-store');
		expect(JSON.stringify(res.headers)).not.toMatch(/HPE_|Parse Error|worker|queue|pid|config|exception/i);
	});

	test('an occupied explicit port rejects initialization', async () => {
		const { startInternalHealthServer } = await moduleUnderTest();
		const occupied = createServer();
		await new Promise<void>(resolve => occupied.listen(0, '0.0.0.0', resolve));
		servers.push(occupied);
		await expect(startInternalHealthServer({ port: (occupied.address() as AddressInfo).port, isLive: () => true, isStarted: () => true })).rejects.toThrow();
	});

	test('closing the listener releases its port', async () => {
		const port = await start(() => true);
		const server = servers.pop()!;
		await new Promise<void>(resolve => server.close(() => resolve()));
		const replacement = createServer();
		await new Promise<void>((resolve, reject) => {
			replacement.once('error', reject);
			replacement.listen(port, '0.0.0.0', resolve);
		});
		servers.push(replacement);
	});
});
