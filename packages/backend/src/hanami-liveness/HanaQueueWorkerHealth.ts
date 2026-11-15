interface QueueWorker {
	on(event: 'closed', listener: () => void): unknown;
	off(event: 'closed', listener: () => void): unknown;
}

export class HanaQueueWorkerHealth {
	private readonly workers = new Map<QueueWorker, { live: boolean; closed: () => void }>();
	private complete = false;
	private stopped = false;

	public register(worker: QueueWorker, runPromise: Promise<unknown>): void {
		const state = { live: !this.stopped, closed: () => { state.live = false; } };
		if (!this.stopped) {
			this.workers.set(worker, state);
			worker.on('closed', state.closed);
		}
		void runPromise.then(state.closed, state.closed);
	}

	public completeRegistration(): void {
		this.complete = true;
	}

	public isStarted(): boolean {
		return !this.stopped && this.complete && this.workers.size > 0;
	}

	public isLive(): boolean {
		return this.isStarted() && [...this.workers.values()].every(state => state.live);
	}

	public stop(): void {
		this.stopped = true;
		for (const [worker, state] of this.workers) worker.off('closed', state.closed);
	}
}
