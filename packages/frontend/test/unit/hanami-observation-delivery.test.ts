import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { HanamiObservation } from '@/utility/hanami-impressions.js';
import { createHanamiObservationDelivery } from '@/utility/hanami-observations.js';
import { misskeyApi, pendingApiRequestsCount } from '@/utility/misskey-api.js';

vi.mock('@/i.js', () => ({ $i: null }));

const baseTime = Date.parse('2026-11-08T00:00:00.000Z');
const record = (id: string) => ({ eventId: id, snapshotId: 'snapshot1', entryId: 'entry1', noteId: 'note1', kind: 'link_copy' as const, occurredAtMs: Date.now(), utcOffsetMinutes: 540 });

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(baseTime); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

/** Oracle: the interaction wire requires one bounded queue (1000 records), batches of at most 100, unchanged identity across at most three total attempts, 500/1000ms retry delays, and a 30-minute retention limit. The send function is the HTTP boundary; all queue decisions and acknowledgement handling are real. */
describe('bounded recommendation observation delivery', () => {
	/** Oracle: 端末文脈契約（2026-11-09）§1。キューへ入れたcontextは値として保存し、呼出側が元のnested objectを変更しても初回送信とretryの内容は変わらない。 */
	test('owns the queued device context value across caller mutation and retries', async () => {
		const send = vi.fn().mockRejectedValueOnce(new Error('Connection interrupted')).mockResolvedValueOnce(undefined);
		const delivery = createHanamiObservationDelivery({ send });
		try {
			const deviceContext = { deviceClass: 'mobile' as const, viewportClass: 'compact' as 'compact' | 'wide', primaryPointer: 'coarse' as const };
			const original = { ...record('context-by-value'), deviceContext };
			const expected = { ...original, deviceContext: { ...deviceContext } };
			delivery.enqueue(original);
			deviceContext.viewportClass = 'wide';
			await delivery.flush();
			expect(send.mock.calls[0][0]).toEqual([expected]);
			await vi.advanceTimersByTimeAsync(500);
			expect(send.mock.calls[1][0]).toEqual([expected]);
		} finally { delivery.dispose(); }
	});

	/** Oracle: the 2026-11-10 public contract treats a fulfilled Promise<void> as success, frees capacity before onAccepted, and retains a rejected batch for retry. */
	test('notifies success without counts and frees queue capacity before callback', async () => {
		const send = vi.fn().mockRejectedValueOnce(new Error('Response lost')).mockResolvedValueOnce(undefined);
		const enqueuedAfterReceipt: boolean[] = [];
		const onAccepted = vi.fn(() => { enqueuedAfterReceipt.push(delivery.enqueue(record('after-receipt'))); });
		const delivery = createHanamiObservationDelivery({ send, onAccepted });
		try {
			for (let index = 0; index < 1_000; index++) delivery.enqueue(record(`queued-${index}`));
			await delivery.flush();
			expect(onAccepted).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(500);
			expect(onAccepted).toHaveBeenCalledExactlyOnceWith();
			expect(enqueuedAfterReceipt).toEqual([true]);
		} finally { delivery.dispose(); }
	});

	test('accepts without waiting for transport and retains ordered batches while a send is pending', async () => {
		let finish!: () => void;
		const send = vi.fn<(batch: HanamiObservation[]) => Promise<void>>(() => new Promise<void>(resolve => { finish = resolve; }));
		const delivery = createHanamiObservationDelivery({ send });
		try {
			const records = Array.from({ length: 1_001 }, (_, index) => record(`event-${index}`));
			expect(records.slice(0, 1_000).map(value => delivery.enqueue(value))).toEqual(Array(1_000).fill(true));
			expect(delivery.enqueue(records[1_000])).toBe(false);
			const first = delivery.flush();
			expect(send).toHaveBeenCalledExactlyOnceWith(records.slice(0, 100));
			await vi.advanceTimersByTimeAsync(1_000);
			expect(send).toHaveBeenCalledTimes(1);
			finish();
			await first;
			const second = delivery.flush();
			expect(send).toHaveBeenCalledTimes(2);
			expect(send.mock.calls[1][0]).toEqual(records.slice(100, 200));
			finish();
			await second;
		} finally { delivery.dispose(); }
	});

	test('retries the identical event and operation time twice then stops after three attempts', async () => {
		const send = vi.fn().mockRejectedValue(new Error('Connection interrupted'));
		const delivery = createHanamiObservationDelivery({ send });
		try {
			const original = record('retry-event');
			delivery.enqueue(original);
			await delivery.flush();
			expect(send).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(499);
			expect(send).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(1);
			expect(send).toHaveBeenCalledTimes(2);
			await vi.advanceTimersByTimeAsync(999);
			expect(send).toHaveBeenCalledTimes(2);
			await vi.advanceTimersByTimeAsync(1);
			expect(send).toHaveBeenCalledTimes(3);
			await vi.advanceTimersByTimeAsync(60_000);
			await delivery.flush();
			expect(send.mock.calls.map(([batch]) => batch)).toEqual([[original], [original], [original]]);
		} finally { delivery.dispose(); }
	});

	test('removes a successful bodyless batch without reissuing the action', async () => {
		const send = vi.fn().mockResolvedValue(undefined);
		const delivery = createHanamiObservationDelivery({ send });
		try {
			delivery.enqueue(record('already-saved'));
			await delivery.flush();
			await vi.advanceTimersByTimeAsync(5_000);
			await delivery.flush();
			expect(send).toHaveBeenCalledTimes(1);
		} finally { delivery.dispose(); }
	});

	test('retains all record fields after a lost response until a successful bodyless retry', async () => {
		const send = vi.fn().mockRejectedValueOnce(new Error('Response lost')).mockResolvedValueOnce(undefined);
		const delivery = createHanamiObservationDelivery({ send });
		try {
			const original = { ...record('lost-response'), deviceContext: { deviceClass: 'mobile' as const, viewportClass: 'compact' as const, primaryPointer: 'coarse' as const }, windowId: 'window-a', windowSequence: 3, windowElapsedMs: 750 };
			delivery.enqueue(original);
			await delivery.flush();
			await vi.advanceTimersByTimeAsync(500);
			expect(send.mock.calls.map(([batch]) => batch)).toEqual([[original], [original]]);
			await vi.advanceTimersByTimeAsync(5_000);
			expect(send).toHaveBeenCalledTimes(2);
		} finally { delivery.dispose(); }
	});

	/** Oracle: the browser API client resolves an HTTP 204 to undefined without parsing JSON. That real client result must remove the batch and notify acceptance/idle exactly once. */
	test('drains a 204 response from the real API client without reading a body or retrying', async () => {
		const response = new Response(null, { status: 204 });
		const json = vi.spyOn(response, 'json');
		const fetch = vi.spyOn(window, 'fetch').mockResolvedValue(response);
		const onAccepted = vi.fn();
		const onIdle = vi.fn();
		const onDropped = vi.fn();
		const delivery = createHanamiObservationDelivery({
			send: observations => misskeyApi('hanami-impressions', { version: 4, observations }),
			onAccepted, onIdle, onDropped,
		});
		try {
			const original = record('http-204');
			delivery.enqueue(original);
			await delivery.flush();
			expect(fetch).toHaveBeenCalledTimes(1);
			expect(JSON.parse(fetch.mock.calls[0][1]?.body as string)).toEqual({ version: 4, observations: [original] });
			expect(json).not.toHaveBeenCalled();
			expect(pendingApiRequestsCount.value).toBe(0);
			expect(onAccepted).toHaveBeenCalledExactlyOnceWith();
			expect(onIdle).toHaveBeenCalledExactlyOnceWith();
			await vi.advanceTimersByTimeAsync(60_000);
			await delivery.flush();
			expect(fetch).toHaveBeenCalledTimes(1);
			expect(onAccepted).toHaveBeenCalledTimes(1);
			expect(onIdle).toHaveBeenCalledTimes(1);
		} finally { delivery.dispose(); }
		expect(onDropped).not.toHaveBeenCalled();
	});

	/** Oracle: a transport timeout is a failed attempt; its eventual response cannot acknowledge the later retry twice. Retry waits 500ms and keeps identity, device context, and window metadata byte-for-byte. */
	test('retries an unchanged timed-out batch and ignores its late success after retry success', async () => {
		let lateSuccess!: () => void;
		const pending = new Promise<void>(resolve => { lateSuccess = resolve; });
		const send = vi.fn().mockReturnValueOnce(pending).mockResolvedValueOnce(undefined);
		const onAccepted = vi.fn();
		const onIdle = vi.fn();
		const onDropped = vi.fn();
		const delivery = createHanamiObservationDelivery({ send, onAccepted, onIdle, onDropped });
		try {
			const original = { ...record('timed-out'), deviceContext: { deviceClass: 'tablet' as const, viewportClass: 'medium' as const, primaryPointer: 'fine' as const }, windowId: 'window-timeout', windowSequence: 2, windowElapsedMs: 500 };
			delivery.enqueue(original);
			const first = delivery.flush();
			await vi.advanceTimersByTimeAsync(29_999);
			expect(send).toHaveBeenCalledTimes(1);
			expect(onAccepted).not.toHaveBeenCalled();
			expect(onIdle).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(1);
			await first;
			await vi.advanceTimersByTimeAsync(499);
			expect(send).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(1);
			expect(send.mock.calls.map(([batch]) => batch)).toEqual([[original], [original]]);
			expect(onAccepted).toHaveBeenCalledExactlyOnceWith();
			expect(onIdle).toHaveBeenCalledExactlyOnceWith();
			lateSuccess();
			await vi.advanceTimersByTimeAsync(60_000);
			await delivery.flush();
			expect(send).toHaveBeenCalledTimes(2);
			expect(onAccepted).toHaveBeenCalledTimes(1);
			expect(onIdle).toHaveBeenCalledTimes(1);
		} finally { lateSuccess(); delivery.dispose(); }
		expect(onDropped).not.toHaveBeenCalled();
	});

	test('drops expired records and still accepts fresh input', async () => {
		const send = vi.fn().mockResolvedValue(undefined);
		const delivery = createHanamiObservationDelivery({ send });
		try {
			delivery.enqueue(record('expired'));
			vi.setSystemTime(baseTime + 30 * 60_000 + 1);
			await delivery.flush();
			expect(send).not.toHaveBeenCalled();
			const fresh = record('fresh');
			expect(delivery.enqueue(fresh)).toBe(true);
			await delivery.flush();
			expect(send).toHaveBeenCalledExactlyOnceWith([fresh]);
		} finally { delivery.dispose(); }
	});
});

/** Oracle: window-api §2 requires explicit loss notifications so a still-open registry cannot call an abandoned batch complete. The unchanged queue bounds and retry delays are covered above. */
describe('observation loss notifications', () => {
	test('reports the exact abandoned batch once after three attempts', async () => {
		const onDropped = vi.fn();
		const onIdle = vi.fn();
		const send = vi.fn().mockRejectedValue(new Error('ACK lost'));
		const delivery = createHanamiObservationDelivery({ send, onDropped, onIdle });
		const original = record('abandoned');
		delivery.enqueue(original);
		await delivery.flush();
		await vi.advanceTimersByTimeAsync(1_500);
		expect(send).toHaveBeenCalledTimes(3);
		expect(onDropped).toHaveBeenCalledExactlyOnceWith([original], 'retry_exhausted');
		expect(onIdle).toHaveBeenCalledExactlyOnceWith();
		delivery.dispose();
		expect(onDropped).toHaveBeenCalledTimes(1);
	});

	test.each(['expired', 'disposed'] as const)('reports retained records removed by %s', async reason => {
		const onDropped = vi.fn();
		const delivery = createHanamiObservationDelivery({ send: vi.fn(), onDropped });
		const original = record(reason);
		delivery.enqueue(original);
		if (reason === 'expired') { vi.setSystemTime(baseTime + 30 * 60_000 + 1); await delivery.flush(); } else delivery.dispose();
		expect(onDropped).toHaveBeenCalledExactlyOnceWith([original], reason);
		delivery.dispose();
		expect(onDropped).toHaveBeenCalledTimes(1);
	});

	test('reports every record removed by REFRESH_REQUIRED including a later queued batch', async () => {
		const onDropped = vi.fn();
		const onExpired = vi.fn();
		const onIdle = vi.fn();
		const delivery = createHanamiObservationDelivery({ send: vi.fn().mockRejectedValue({ code: 'REFRESH_REQUIRED' }), onDropped, onExpired, onIdle });
		const records = Array.from({ length: 101 }, (_, index) => record(`expired-snapshot-${index}`));
		for (const original of records) delivery.enqueue(original);
		await delivery.flush();
		expect(onDropped).toHaveBeenCalledExactlyOnceWith(records, 'refresh_required');
		expect(onExpired).toHaveBeenCalledExactlyOnceWith(['snapshot1']);
		expect(onIdle).toHaveBeenCalledExactlyOnceWith();
		delivery.dispose();
	});
});
