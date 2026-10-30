/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { afterEach, describe, expect, test, vi } from 'vitest';

interface Probe { type: string; token: unknown }
class WorkerChannel extends EventEmitter {
	public responsive = true;
	public listening = true;
	public probes: Probe[] = [];
	constructor(public id: number) { super(); }
	public send(message: Probe) {
		this.probes.push(message);
		if (this.responsive) this.respond(message);
		return true;
	}
	public respond(message: Probe) {
		this.emit('message', { type: 'internal-health:response', token: message.token, listening: this.listening });
	}
}

/** Oracle: Web liveness requires current identities, local IPC and actual listener
 * evidence; one failed worker is replaced without disturbing responsive siblings.
 * This double models the cluster IPC boundary, not a running application process.
 */
describe('Web current worker health', () => {
	afterEach(() => { vi.useRealTimers(); });

	async function setup(count: number) {
		const { WebWorkerHealth } = await import('@/health/WebWorkerHealth.js');
		vi.useFakeTimers();
		const restart = vi.fn();
		const health = new WebWorkerHealth({ timeoutMs: 50, restart });
		const workers = Array.from({ length: count }, (_, index) => new WorkerChannel(index + 1));
		for (const worker of workers) health.register(worker);
		return { health, workers, restart };
	}

	test('no unrelated timer or empty worker set satisfies startup/liveness', async () => {
		const { health, restart } = await setup(0);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(health.isStarted()).toBe(false);
		await expect(health.check()).resolves.toBe(false);
		expect(restart).not.toHaveBeenCalled();
		health.stop();
	});

	test.each([1, 3, 5])('startup comes from all %i actual serving workers', async count => {
		const { health, workers } = await setup(count);
		expect(health.isStarted()).toBe(false);
		await expect(health.check()).resolves.toBe(true);
		expect(health.isStarted()).toBe(true);
		for (const worker of workers) expect(worker.probes.at(-1)?.type).toBe('internal-health:probe');
		health.stop();
	});

	test('one frozen worker is replaced while responsive siblings keep role live', async () => {
		const { health, workers, restart } = await setup(4);
		await health.check();
		workers[2].responsive = false;
		const result = health.check();
		await vi.advanceTimersByTimeAsync(50);
		await expect(result).resolves.toBe(true);
		expect(restart.mock.calls).toEqual([[workers[2]]]);
		expect(health.isStarted()).toBe(false);
		const repeated = health.check();
		await vi.advanceTimersByTimeAsync(50);
		await expect(repeated).resolves.toBe(true);
		expect(restart.mock.calls).toEqual([[workers[2]]]);
		health.stop();
	});

	test('a responsive loop whose listener is closed is replaced', async () => {
		const { health, workers, restart } = await setup(2);
		await health.check();
		workers[1].listening = false;
		const result = health.check();
		await vi.advanceTimersByTimeAsync(50);
		await expect(result).resolves.toBe(true);
		expect(restart.mock.calls).toEqual([[workers[1]]]);
		health.stop();
	});

	test('all frozen workers cannot be masked by the primary remaining alive', async () => {
		const { health, workers, restart } = await setup(3);
		await health.check();
		for (const worker of workers) worker.responsive = false;
		const result = health.check();
		await vi.advanceTimersByTimeAsync(50);
		await expect(result).resolves.toBe(false);
		expect(new Set(restart.mock.calls.map(([worker]) => worker))).toEqual(new Set(workers));
		health.stop();
	});

	test('a previous success is not cached through later event-loop failure', async () => {
		const { health, workers } = await setup(1);
		await expect(health.check()).resolves.toBe(true);
		workers[0].responsive = false;
		const result = health.check();
		await vi.advanceTimersByTimeAsync(50);
		await expect(result).resolves.toBe(false);
		health.stop();
	});

	test('an old probe token cannot satisfy the next health check', async () => {
		const { health, workers } = await setup(1);
		await health.check();
		const oldProbe = workers[0].probes[0];
		workers[0].responsive = false;
		const result = health.check();
		workers[0].respond(oldProbe);
		await vi.advanceTimersByTimeAsync(50);
		await expect(result).resolves.toBe(false);
		health.stop();
	});

	test('exited generation cannot certify a replacement with a reused worker id', async () => {
		const { health, workers } = await setup(1);
		await health.check();
		const old = workers[0];
		old.emit('exit', 1, null);
		const replacement = new WorkerChannel(old.id);
		replacement.responsive = false;
		health.register(replacement);
		expect(health.isStarted()).toBe(false);
		const result = health.check();
		old.respond(replacement.probes.at(-1)!);
		await vi.advanceTimersByTimeAsync(50);
		await expect(result).resolves.toBe(false);
		health.stop();
	});

	test('a replacement and newly registered worker each prove their own startup', async () => {
		const { health, workers } = await setup(1);
		await health.check();
		workers[0].emit('exit', 0, null);
		const replacement = new WorkerChannel(10);
		health.register(replacement);
		expect(health.isStarted()).toBe(false);
		await health.check();
		expect(health.isStarted()).toBe(true);
		const added = new WorkerChannel(11);
		health.register(added);
		expect(health.isStarted()).toBe(false);
		await expect(health.check()).resolves.toBe(true);
		expect(added.probes).toHaveLength(1);
		expect(health.isStarted()).toBe(true);
		health.stop();
	});

	test('shutdown prevents pending timeout reforks and removes worker handlers', async () => {
		const { health, workers, restart } = await setup(2);
		await health.check();
		for (const worker of workers) worker.responsive = false;
		const result = health.check();
		health.stop();
		for (const worker of workers) {
			expect(worker.listenerCount('message')).toBe(0);
			expect(worker.listenerCount('exit')).toBe(0);
		}
		await vi.advanceTimersByTimeAsync(100);
		await expect(result).resolves.toBe(false);
		expect(restart).not.toHaveBeenCalled();
	});

	test('initial workers waiting for their listener stay unstarted without a premature refork', async () => {
		const { health, workers, restart } = await setup(2);
		workers[1].listening = false;
		const result = health.check();
		await vi.advanceTimersByTimeAsync(50);
		await result;
		expect(health.isStarted()).toBe(false);
		expect(restart).not.toHaveBeenCalled();
		workers[1].listening = true;
		await health.check();
		expect(health.isStarted()).toBe(true);
		health.stop();
	});

	test('an unrelated channel response cannot certify a current worker', async () => {
		const { health, workers } = await setup(1);
		await health.check();
		workers[0].responsive = false;
		const unrelated = new WorkerChannel(999);
		const result = health.check();
		unrelated.respond(workers[0].probes.at(-1)!);
		await vi.advanceTimersByTimeAsync(50);
		await expect(result).resolves.toBe(false);
		health.stop();
	});
});

/** Oracle: a worker health response must originate in the HTTP-serving loop
 * and observe its actual listener. Real Node listener transitions are used here.
 */
describe('Web worker IPC responder', () => {
	test('uses the current HTTP listener state and can be disposed', async () => {
		const { installWebWorkerHealthResponder } = await import('@/health/WebWorkerHealth.js');
		const server = createServer();
		const channel = Object.assign(new EventEmitter(), { send: vi.fn() });
		const dispose = installWebWorkerHealthResponder({ channel, isListening: () => server.listening });
		try {
			channel.emit('message', { type: 'internal-health:probe', token: 'before-listen' });
			expect(channel.send).toHaveBeenLastCalledWith({ type: 'internal-health:response', token: 'before-listen', listening: false });
			await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
			channel.emit('message', { type: 'internal-health:probe', token: 'listening' });
			expect(channel.send).toHaveBeenLastCalledWith({ type: 'internal-health:response', token: 'listening', listening: true });
			await new Promise<void>(resolve => server.close(() => resolve()));
			channel.emit('message', { type: 'internal-health:probe', token: 'closed' });
			expect(channel.send).toHaveBeenLastCalledWith({ type: 'internal-health:response', token: 'closed', listening: false });
			dispose();
			channel.send.mockClear();
			channel.emit('message', { type: 'internal-health:probe', token: 'after-disposal' });
			expect(channel.send).not.toHaveBeenCalled();
		} finally {
			dispose();
			if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
		}
	});
});
