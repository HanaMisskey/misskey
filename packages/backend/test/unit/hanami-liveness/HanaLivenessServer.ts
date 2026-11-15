import { createServer, request } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
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
	return import('@/hanami-liveness/HanaLivenessServer.js');
}

async function start(isLive: () => boolean | Promise<boolean>, isStarted = isLive) {
	const { startHanaLivenessServer } = await moduleUnderTest();
	const server = await startHanaLivenessServer({ port: await explicitPort(), isLive, isStarted });
	expect(server).toBeDefined();
	servers.push(server!);
	const address = server!.address() as AddressInfo;
	expect(['0.0.0.0', '::']).toContain(address.address);
	return address.port;
}

function http(port: number, path: string, method = 'GET') {
	return new Promise<{ status: number; body: string; headers: Record<string, unknown> }>((resolve, reject) => {
		const req = request({ host: '127.0.0.1', port, path, method }, res => {
			const chunks: Buffer[] = [];
			res.on('data', chunk => chunks.push(chunk));
			res.on('end', () => resolve({ status: res.statusCode!, body: Buffer.concat(chunks).toString(), headers: res.headers }));
		});
		req.setTimeout(1000, () => req.destroy(new Error('internal HTTP deadline exceeded')));
		req.on('error', reject);
		req.end();
	});
}

/** Oracle: opting out must allocate no listener, and an enabled listener needs
 * a valid port distinct from the public application port. Port spelling details
 * are implementation choices rather than a separate compatibility contract.
 */
describe('Hana liveness port configuration', () => {
	test('absence disables without invoking role predicates', async () => {
		const { parseHanaLivenessPort, startHanaLivenessServer } = await moduleUnderTest();
		expect(parseHanaLivenessPort(undefined, 3000)).toBeUndefined();
		const predicate = vi.fn(() => { throw new Error('must not read disabled role'); });
		expect(await startHanaLivenessServer({ port: undefined, isLive: predicate, isStarted: predicate })).toBeUndefined();
		expect(predicate).not.toHaveBeenCalled();
	});

	test('accepts a valid custom port', async () => {
		const { parseHanaLivenessPort } = await moduleUnderTest();
		expect(parseHanaLivenessPort('43123', 8080)).toBe(43123);
	});

	test.each(['0', '-1', '65536', 'not-a-port'])('rejects unusable port %s', async raw => {
		const { parseHanaLivenessPort } = await moduleUnderTest();
		expect(() => parseHanaLivenessPort(raw, 3000)).toThrow();
	});

	test('rejects collision with the public listener', async () => {
		const { parseHanaLivenessPort } = await moduleUnderTest();
		expect(() => parseHanaLivenessPort('8080', 8080)).toThrow();
	});
});

/** Oracle: kubelet GET probes must distinguish startup from current liveness,
 * reflect state changes and disclose no predicate errors. Real HTTP verifies
 * response status and content rather than a mocked response writer.
 */
describe('Hana liveness HTTP responses', () => {
	test('startup and liveness reflect their own current state', async () => {
		let live = true;
		let started = false;
		const port = await start(() => live, () => started);
		for (const [path, status] of [['/livez', 200], ['/startupz', 503]] as const) {
			const res = await http(port, path);
			expect(res).toMatchObject({ status, body: '' });
			expect(res.headers['cache-control']).toBe('no-store');
		}
		started = true;
		live = false;
		expect((await http(port, '/startupz')).status).toBe(200);
		expect((await http(port, '/livez')).status).toBe(503);
	});

	test.each(['throw', 'reject'])('predicate %s returns an empty unavailable response', async failure => {
		const secret = 'private-database-credential';
		const predicate = () => {
			if (failure === 'throw') throw new Error(secret);
			return Promise.reject(new Error(secret));
		};
		const port = await start(predicate);
		for (const path of ['/livez', '/startupz']) {
			const res = await http(port, path);
			expect(res).toMatchObject({ status: 503, body: '' });
			expect(res.headers['cache-control']).toBe('no-store');
			expect(JSON.stringify(res.headers)).not.toContain(secret);
		}
	});

	test('a query cannot enable diagnostic output', async () => {
		const port = await start(() => true);
		const res = await http(port, '/livez?verbose=true&details=1');
		expect(res).toMatchObject({ status: 200, body: '' });
		expect(res.headers['cache-control']).toBe('no-store');
	});

	test.each([['GET', '/diagnostics'], ['POST', '/livez']])('%s %s cannot report a healthy probe', async (method, path) => {
		const predicate = vi.fn(() => true);
		const port = await start(predicate);
		const res = await http(port, path, method);
		expect(res.status).toBeGreaterThanOrEqual(400);
		expect(res.body).toBe('');
		expect(predicate).not.toHaveBeenCalled();
	});

	test('an occupied port rejects initialization', async () => {
		const { startHanaLivenessServer } = await moduleUnderTest();
		const occupied = createServer();
		await new Promise<void>(resolve => occupied.listen(0, '0.0.0.0', resolve));
		servers.push(occupied);
		await expect(startHanaLivenessServer({ port: (occupied.address() as AddressInfo).port, isLive: () => true, isStarted: () => true })).rejects.toThrow();
	});
});
