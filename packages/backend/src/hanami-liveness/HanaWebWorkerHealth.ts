import { randomUUID } from 'node:crypto';

interface Channel {
	on(event: 'message', listener: (message: unknown) => void): unknown;
	off(event: 'message', listener: (message: unknown) => void): unknown;
	send(message: object, callback?: (error: Error | null) => void): unknown;
}
interface Worker extends Channel {
	id: number;
	on(event: 'message', listener: (message: unknown) => void): unknown;
	off(event: 'message', listener: (message: unknown) => void): unknown;
	on(event: 'exit', listener: () => void): unknown;
	off(event: 'exit', listener: () => void): unknown;
}
interface WorkerState {
	started: boolean;
	failed: boolean;
	receive: (message: unknown) => void;
	exit: () => void;
	pending?: { token: string; finish: (live: boolean) => void };
}

export class HanaWebWorkerHealth {
	private readonly workers = new Map<Worker, WorkerState>();
	private stopped = false;
	private checking?: Promise<boolean>;

	constructor(private readonly options: { timeoutMs: number; restart: (worker: Worker) => void }) {}

	public register(worker: Worker): void {
		if (this.stopped || this.workers.has(worker)) return;
		const state: WorkerState = {
			started: false,
			failed: false,
			receive: message => {
				if (message == null || typeof message !== 'object' || !('type' in message) || message.type !== 'hana-liveness:response') return;
				if (!('token' in message) || message.token !== state.pending?.token) return;
				state.pending?.finish('listening' in message && message.listening === true);
			},
			exit: () => {
				this.workers.delete(worker);
				worker.off('message', state.receive);
				worker.off('exit', state.exit);
				state.pending?.finish(false);
			},
		};
		this.workers.set(worker, state);
		worker.on('message', state.receive);
		worker.on('exit', state.exit);
	}

	public isStarted(): boolean {
		return !this.stopped && this.workers.size > 0 && [...this.workers.values()].every(state => state.started && !state.failed);
	}

	public check(): Promise<boolean> {
		if (this.checking) return this.checking;
		this.checking = this.checkWorkers().finally(() => { this.checking = undefined; });
		return this.checking;
	}

	private async checkWorkers(): Promise<boolean> {
		if (this.stopped) return false;
		const results = await Promise.all([...this.workers].map(([worker, state]) => new Promise<boolean>(resolve => {
			if (state.failed) { resolve(false); return; }
			const token = randomUUID();
			const timeout = setTimeout(() => finish(false), this.options.timeoutMs);
			const finish = (live: boolean) => {
				if (state.pending?.token !== token) return;
				clearTimeout(timeout);
				state.pending = undefined;
				if (!this.stopped && this.workers.get(worker) === state) {
					if (live) {
						state.started = true;
					} else if (state.started) {
						state.failed = true;
						this.options.restart(worker);
					}
					resolve(live);
				} else {
					resolve(false);
				}
			};
			state.pending = { token, finish };
			try {
				worker.send({ type: 'hana-liveness:probe', token }, error => { if (error) finish(false); });
			} catch {
				finish(false);
			}
		})));
		return !this.stopped && results.some(Boolean);
	}

	public stop(): void {
		this.stopped = true;
		for (const [worker, state] of this.workers) {
			worker.off('message', state.receive);
			worker.off('exit', state.exit);
			state.pending?.finish(false);
		}
		this.workers.clear();
	}
}

export function installHanaWebWorkerHealthResponder(options: { channel: Channel; isListening: () => boolean }): () => void {
	const receive = (message: unknown) => {
		if (message == null || typeof message !== 'object' || !('type' in message) || message.type !== 'hana-liveness:probe' || !('token' in message)) return;
		options.channel.send({ type: 'hana-liveness:response', token: message.token, listening: options.isListening() });
	};
	options.channel.on('message', receive);
	return () => { options.channel.off('message', receive); };
}
