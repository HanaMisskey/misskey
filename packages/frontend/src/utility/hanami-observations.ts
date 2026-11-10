import type { HanamiObservation } from '@/utility/hanami-impressions.js';

type Pending = { record: HanamiObservation; attempts: number; nextAttemptAt: number };
type DropReason = 'expired' | 'retry_exhausted' | 'refresh_required' | 'disposed';
const retentionMs = 30 * 60_000;
const copyObservation = (record: HanamiObservation): HanamiObservation => ({
	...record,
	...(record.deviceContext === undefined ? {} : { deviceContext: { ...record.deviceContext } }),
});

export function createHanamiObservationDelivery(options: {
	send: (observations: HanamiObservation[]) => Promise<void>;
	onAccepted?: () => void;
	onIdle?: () => void;
	onExpired?: (snapshotIds: string[]) => void;
	onDropped?: (records: HanamiObservation[], reason: DropReason) => void;
}) {
	let pending: Pending[] = [];
	let retry: Pending[] | undefined;
	let sending: Promise<void> | undefined;
	let timer: number | undefined;
	let disposed = false;

	function drop(matches: (item: Pending) => boolean, reason: DropReason) {
		const removed = pending.filter(matches);
		pending = pending.filter(item => !removed.includes(item));
		if (removed.length > 0) options.onDropped?.(removed.map(item => copyObservation(item.record)), reason);
	}

	function prune() {
		const now = Date.now();
		drop(item => now - item.record.occurredAtMs > retentionMs, 'expired');
		if (retry) retry = retry.filter(item => pending.includes(item));
		if (retry?.length === 0) retry = undefined;
	}

	function schedule(delay = 250) {
		if (disposed || pending.length === 0) return;
		if (timer != null) window.clearTimeout(timer);
		timer = window.setTimeout(() => { timer = undefined; void flush(); }, delay);
	}

	async function deliver(batch: Pending[]) {
		for (const item of batch) item.attempts++;
		let deadline: number | undefined;
		try {
			const records = batch.map(item => copyObservation(item.record));
			await Promise.race([
				options.send(records),
				new Promise<never>((_resolve, reject) => { deadline = window.setTimeout(() => reject(new Error('Observation delivery timeout')), 30_000); }),
			]);
			pending = pending.filter(item => !batch.includes(item));
			retry = undefined;
			options.onAccepted?.();
		} catch (error) {
			if (disposed) return;
			if (error && typeof error === 'object' && 'code' in error && error.code === 'REFRESH_REQUIRED') {
				const snapshots = [...new Set(batch.map(item => item.record.snapshotId))];
				drop(item => snapshots.includes(item.record.snapshotId), 'refresh_required');
				retry = undefined;
				options.onExpired?.(snapshots);
			} else if (batch[0].attempts >= 3) {
				drop(item => batch.includes(item), 'retry_exhausted');
				retry = undefined;
			} else {
				retry = batch;
				for (const item of batch) item.nextAttemptAt = Date.now() + (item.attempts === 1 ? 500 : 1000);
			}
		} finally {
			if (deadline != null) window.clearTimeout(deadline);
		}
	}

	function flush(): Promise<void> {
		if (sending) return sending;
		if (timer != null) window.clearTimeout(timer);
		timer = undefined;
		prune();
		if (disposed || pending.length === 0) return Promise.resolve();
		const batch = retry ?? pending.slice(0, 100);
		const delay = Math.max(0, batch[0].nextAttemptAt - Date.now());
		if (delay > 0) { schedule(delay); return Promise.resolve(); }
		sending = deliver(batch).finally(() => {
			sending = undefined;
			prune();
			if (pending.length === 0) options.onIdle?.();
			schedule(retry ? Math.max(0, retry[0].nextAttemptAt - Date.now()) : 250);
		});
		return sending;
	}

	return {
		enqueue(record: HanamiObservation): boolean {
			prune();
			if (disposed || pending.length >= 1000 || Date.now() - record.occurredAtMs > retentionMs) return false;
			pending.push({ record: copyObservation(record), attempts: 0, nextAttemptAt: 0 });
			if (!sending && timer == null) schedule();
			return true;
		},
		flush,
		dispose() {
			disposed = true;
			if (timer != null) window.clearTimeout(timer);
			drop(() => true, 'disposed');
			retry = undefined;
		},
	};
}
