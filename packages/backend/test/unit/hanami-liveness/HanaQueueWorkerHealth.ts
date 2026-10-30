import { EventEmitter } from 'node:events';
import { describe, expect, test } from 'vitest';
import { HanaQueueWorkerHealth } from '@/hanami-liveness/HanaQueueWorkerHealth.js';

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

/** Oracle: queue liveness requires actual registered run loops. Any terminated
 * loop makes the process unhealthy; pending work and dependency errors do not.
 * Small lifecycle doubles characterize that policy, not BullMQ or boot wiring.
 */
describe('Hana queue worker lifecycle', () => {
	test('empty registration and incomplete registration cannot claim startup', () => {
		const health = new HanaQueueWorkerHealth();
		expect(health.isStarted()).toBe(false);
		expect(health.isLive()).toBe(false);
		health.completeRegistration();
		expect(health.isStarted()).toBe(false);
		expect(health.isLive()).toBe(false);
		health.stop();
		const pending = new HanaQueueWorkerHealth();
		const entry = loop();
		pending.register(entry.worker, entry.promise);
		expect(pending.isStarted()).toBe(false);
		expect(pending.isLive()).toBe(false);
		pending.completeRegistration();
		expect(pending.isStarted()).toBe(true);
		expect(pending.isLive()).toBe(true);
		pending.stop();
	});

	test.each(['resolve', 'reject', 'closed'])('unexpected %s fails liveness while another loop remains pending', async termination => {
		const health = new HanaQueueWorkerHealth();
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

	test('pending loops stay live while idle, processing work and reporting dependency errors', async () => {
		const health = new HanaQueueWorkerHealth();
		const entry = loop();
		health.register(entry.worker, entry.promise);
		health.completeRegistration();
		expect(health.isLive()).toBe(true);
		entry.worker.emit('active', { name: 'valid long job' });
		await settled();
		expect(health.isLive()).toBe(true);
		entry.worker.emit('error', new Error('temporary Redis unavailable'));
		entry.worker.emit('failed', { name: 'job' }, new Error('temporary DB unavailable'));
		await settled();
		expect(health.isLive()).toBe(true);
		health.stop();
	});

	test('shutdown marks unhealthy and removes owned handlers while observing a late rejection', async () => {
		const health = new HanaQueueWorkerHealth();
		const entry = loop();
		const previous = entry.worker.listenerCount('closed');
		health.register(entry.worker, entry.promise);
		health.completeRegistration();
		health.stop();
		expect(health.isStarted()).toBe(false);
		expect(health.isLive()).toBe(false);
		expect(entry.worker.listenerCount('closed')).toBe(previous);
		entry.reject(new Error('closing run loop'));
		await settled();
	});
});
