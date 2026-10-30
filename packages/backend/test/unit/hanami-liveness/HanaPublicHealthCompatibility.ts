import Fastify from 'fastify';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { Redis } from 'ioredis';
import type { DataSource } from 'typeorm';
import { HealthServerService } from '@/server/HealthServerService.js';
import { readyRef } from '@/boot/ready.js';

/** Oracle: the public health endpoint must reveal no diagnostic details.
 * Existing aggregate status and no-store behavior are compatibility checks.
 * Real HTTP exercises this plugin; application routing is outside this test.
 */
describe('public health privacy and compatibility', () => {
	const originalReady = readyRef.value;
	afterEach(() => { readyRef.value = originalReady; });

	test.each(['healthy', 'not-ready', 'db', 'redis'])('%s public health contains no diagnostics', async failure => {
		readyRef.value = failure !== 'not-ready';
		const leak = 'PRIVATE connection credential worker queue pid';
		const redis = { ping: vi.fn(async () => {
			if (failure === 'redis') throw new Error(leak);
			return 'PONG';
		}) } as unknown as Redis;
		const db = { query: vi.fn(async () => {
			if (failure === 'db') throw new Error(leak);
			return [{ '?column?': 1 }];
		}) } as unknown as DataSource;
		const service = new HealthServerService(redis, redis, redis, redis, redis, db);
		const app = Fastify();
		app.register(service.createServer, { prefix: '/healthz' });
		const url = await app.listen({ host: '127.0.0.1', port: 0 });
		try {
			for (const method of ['GET', 'HEAD']) {
				const response = await fetch(`${url}/healthz?verbose=true`, { method, signal: AbortSignal.timeout(1000) });
				expect(response.status).toBe(failure === 'healthy' ? 200 : 503);
				expect(await response.text()).toBe('');
				expect(response.headers.get('cache-control')).toBe('no-store');
				expect(JSON.stringify([...response.headers])).not.toContain(leak);
			}
		} finally {
			await app.close();
		}
	});
});
