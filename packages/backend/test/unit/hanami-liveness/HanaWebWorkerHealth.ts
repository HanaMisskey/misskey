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
		this.emit('message', { type: 'hana-liveness:response', token: message.token, listening: this.listening });
	}
}

/** Oracle: replacing an unresponsive Web worker must preserve serving siblings;
 * no responsive serving worker means the Web process cannot claim liveness.
 * IPC doubles characterize that policy, not application boot or real processes.
 */
describe('Web current worker health', () => {
	afterEach(() => { vi.useRealTimers(); });

	async function setup(count: number) {
		const { HanaWebWorkerHealth } = await import('@/hanami-liveness/HanaWebWorkerHealth.js');
		vi.useFakeTimers();
		const restart = vi.fn();
		const health = new HanaWebWorkerHealth({ timeoutMs: 50, restart });
		const workers = Array.from({ length: count }, (_, index) => new WorkerChannel(index + 1));
		for (const worker of workers) health.register(worker);
		return { health, workers, restart };
	}

	test('an empty worker set cannot satisfy startup or liveness', async () => {
		const { health, restart } = await setup(0);
		expect(health.isStarted()).toBe(false);
		await expect(health.check()).resolves.toBe(false);
		expect(restart).not.toHaveBeenCalled();
		health.stop();
	});

	test('startup comes from every serving worker', async () => {
		const { health } = await setup(2);
		expect(health.isStarted()).toBe(false);
		await expect(health.check()).resolves.toBe(true);
		expect(health.isStarted()).toBe(true);
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

	test('a delayed response to a timed-out startup probe cannot certify the next check', async () => {
		const { health, workers } = await setup(1);
		workers[0].responsive = false;
		const first = health.check();
		const oldProbe = workers[0].probes[0];
		await vi.advanceTimersByTimeAsync(50);
		await expect(first).resolves.toBe(false);
		const next = health.check();
		workers[0].respond(oldProbe);
		expect(health.isStarted()).toBe(false);
		await vi.advanceTimersByTimeAsync(50);
		await expect(next).resolves.toBe(false);
		health.stop();
	});

	test('a replacement must prove its own startup', async () => {
		const { health, workers } = await setup(1);
		await health.check();
		workers[0].emit('exit', 0, null);
		const replacement = new WorkerChannel(10);
		health.register(replacement);
		expect(health.isStarted()).toBe(false);
		await health.check();
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
});

/** Oracle: an IPC responder must report its current listener state, so a responsive
 * event loop with a closed HTTP listener cannot certify service availability.
 * This boundary test does not prove application boot installs the responder.
 */
describe('Web worker IPC responder', () => {
	test('uses the current HTTP listener state and can be disposed', async () => {
		const { installHanaWebWorkerHealthResponder } = await import('@/hanami-liveness/HanaWebWorkerHealth.js');
		const server = createServer();
		const channel = Object.assign(new EventEmitter(), { send: vi.fn() });
		const dispose = installHanaWebWorkerHealthResponder({ channel, isListening: () => server.listening });
		try {
			channel.emit('message', { type: 'hana-liveness:probe', token: 'before-listen' });
			expect(channel.send).toHaveBeenLastCalledWith({ type: 'hana-liveness:response', token: 'before-listen', listening: false });
			await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
			channel.emit('message', { type: 'hana-liveness:probe', token: 'listening' });
			expect(channel.send).toHaveBeenLastCalledWith({ type: 'hana-liveness:response', token: 'listening', listening: true });
			await new Promise<void>(resolve => server.close(() => resolve()));
			channel.emit('message', { type: 'hana-liveness:probe', token: 'closed' });
			expect(channel.send).toHaveBeenLastCalledWith({ type: 'hana-liveness:response', token: 'closed', listening: false });
			dispose();
			channel.send.mockClear();
			channel.emit('message', { type: 'hana-liveness:probe', token: 'after-disposal' });
			expect(channel.send).not.toHaveBeenCalled();
		} finally {
			dispose();
			if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
		}
	});
});
