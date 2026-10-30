/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, test, vi } from 'vitest';

function loop() {
	let resolve!: () => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
	const worker = new EventEmitter();
	worker.on('error', () => {});
	return { worker, promise, resolve, reject };
}

async function settled() {
	await Promise.resolve();
	await Promise.resolve();
}

/** Oracle: Queue liveness covers the set of actual registered worker run loops.
 * EventEmitter and deferred run() promises represent only the Bull lifecycle boundary;
 * pending work and dependency errors do not imply that a run loop ended.
 */
describe('queue worker lifecycle health', () => {
	afterEach(() => { vi.useRealTimers(); });

	test('a timer and an empty registration cannot claim role initialization', async () => {
		const { QueueWorkerHealth } = await import('@/health/QueueWorkerHealth.js');
		const health = new QueueWorkerHealth();
		expect(health.isStarted()).toBe(false);
		expect(health.isLive()).toBe(false);
		health.completeRegistration();
		expect(health.isStarted()).toBe(false);
		expect(health.isLive()).toBe(false);
		health.stop();
	});

	test.each([1, 4, 11])('all %i registered loops matter, including the last one', async count => {
		const { QueueWorkerHealth } = await import('@/health/QueueWorkerHealth.js');
		const health = new QueueWorkerHealth();
		const loops = Array.from({ length: count }, loop);
		for (const entry of loops) health.register(entry.worker, entry.promise);
		expect(health.isStarted()).toBe(false);
		health.completeRegistration();
		expect(health.isStarted()).toBe(true);
		expect(health.isLive()).toBe(true);
		loops.at(-1)!.resolve();
		await settled();
		expect(health.isLive()).toBe(false);
		health.stop();
	});

	test.each(['empty', 'long-running', 'dependency-errors'])('%s queue stays live while its run loop is pending', async condition => {
		const { QueueWorkerHealth } = await import('@/health/QueueWorkerHealth.js');
		vi.useFakeTimers();
		const health = new QueueWorkerHealth();
		const entry = loop();
		health.register(entry.worker, entry.promise);
		health.completeRegistration();
		if (condition === 'dependency-errors') {
			entry.worker.emit('error', new Error('temporary Redis unavailable'));
			entry.worker.emit('failed', { name: 'job' }, new Error('temporary DB unavailable'));
		} else if (condition === 'long-running') {
			entry.worker.emit('active', { name: 'valid long job' });
		}
		await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
		expect(health.isLive()).toBe(true);
		expect(health.isStarted()).toBe(true);
		health.stop();
	});

	test.each(['resolve', 'reject', 'closed'])('unexpected %s is unhealthy although other workers remain pending', async termination => {
		const { QueueWorkerHealth } = await import('@/health/QueueWorkerHealth.js');
		const health = new QueueWorkerHealth();
		const healthy = loop();
		const failed = loop();
		health.register(healthy.worker, healthy.promise);
		health.register(failed.worker, failed.promise);
		health.completeRegistration();
		expect(health.isLive()).toBe(true);
		if (termination === 'resolve') failed.resolve();
		if (termination === 'reject') failed.reject(new Error('worker run loop terminated'));
		if (termination === 'closed') failed.worker.emit('closed');
		await settled();
		expect(health.isLive()).toBe(false);
		health.stop();
	});

	test('a dynamically registered worker participates without a fixed expected count', async () => {
		const { QueueWorkerHealth } = await import('@/health/QueueWorkerHealth.js');
		const health = new QueueWorkerHealth();
		const first = loop();
		health.register(first.worker, first.promise);
		health.completeRegistration();
		const added = loop();
		health.register(added.worker, added.promise);
		expect(health.isLive()).toBe(true);
		added.worker.emit('closed');
		expect(health.isLive()).toBe(false);
		health.stop();
	});

	test('an already rejected run promise is observed and cannot appear live', async () => {
		const { QueueWorkerHealth } = await import('@/health/QueueWorkerHealth.js');
		const health = new QueueWorkerHealth();
		const entry = loop();
		entry.reject(new Error('early run failure'));
		health.register(entry.worker, entry.promise);
		health.completeRegistration();
		await settled();
		expect(health.isLive()).toBe(false);
		health.stop();
	});

	test('normal shutdown marks unhealthy, removes listeners and still handles run rejection', async () => {
		const { QueueWorkerHealth } = await import('@/health/QueueWorkerHealth.js');
		const health = new QueueWorkerHealth();
		const entry = loop();
		const previous = entry.worker.listenerCount('closed');
		health.register(entry.worker, entry.promise);
		health.completeRegistration();
		health.stop();
		expect(health.isLive()).toBe(false);
		expect(entry.worker.listenerCount('closed')).toBe(previous);
		entry.reject(new Error('closing run loop'));
		await settled();
	});
});
