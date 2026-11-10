import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { HanamiDisplayEvent, HanamiObservation, HanamiViewportObservation } from '@/utility/hanami-impressions.js';
import { createHanamiObservationWindows } from '@/utility/hanami-observation-windows.js';

const baseTime = Date.parse('2026-11-10T00:00:00.000Z');
const context = (entryId = 'entry-a'): HanamiDisplayEvent => ({ eventId: `display-${entryId}`, snapshotId: 'snapshot-a', entryId, noteId: `note-${entryId}` });
const viewport = (source = context(), sequence = 0, elapsedMs = 0, visibleArea = 1): HanamiViewportObservation => ({ ...source, kind: 'viewport', occurredAtMs: Date.now(), utcOffsetMinutes: 540, sequence, elapsedMs, visibleArea, availableArea: 1, documentVisible: true, focused: true, activityAgeMs: 0, scrollIdleMs: 0, ended: false });
const disposers: (() => void)[] = [];

function fixture() {
	let account: string | undefined = 'alice';
	let reject = false;
	const records: Record<string, unknown>[] = [];
	const attempted: Record<string, unknown>[] = [];
	const registry = createHanamiObservationWindows({
		accountId: () => account,
		enqueue: (record: HanamiObservation) => {
			attempted.push({ ...record });
			if (reject) return false;
			records.push({ ...record });
			return true;
		},
	});
	disposers.push(() => registry.dispose());
	return { registry, records, attempted, reject: (value: boolean) => { reject = value; }, account: (value: string | undefined) => { account = value; } };
}

const close = (f: ReturnType<typeof fixture>) => f.records.filter(record => record.kind === 'window' && record.phase === 'close');
const opens = (f: ReturnType<typeof fixture>) => f.records.filter(record => record.kind === 'window' && record.phase === 'open');

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
	vi.setSystemTime(baseTime);
	vi.spyOn(document, 'hasFocus').mockReturnValue(true);
	Object.defineProperty(document, 'hidden', { configurable: true, value: false });
	Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); document.body.replaceChildren(); });

/** Oracle: window-api §2 and contract §6 specify browser window boundaries, event order and delivery completeness. */
describe('same-document observation windows', () => {
	test('starts at the first positive viewport while preserving the original series clock and position', async () => {
		const f = fixture();
		f.registry.viewport(viewport(context(), 0, 0, 0), 4);
		await vi.advanceTimersByTimeAsync(58_000);
		expect(opens(f)).toEqual([]);
		f.registry.viewport(viewport(context(), 7, 58_000), 4);
		await vi.advanceTimersByTimeAsync(5_000);
		f.registry.record(context(), { kind: 'detail_open' });
		expect(opens(f)).toEqual([expect.objectContaining({ displayPosition: 4, windowSequence: 0, windowElapsedMs: 0 })]);
		expect(f.records.find(record => record.kind === 'viewport' && record.sequence === 7)).toMatchObject({ sequence: 7, elapsedMs: 58_000, windowSequence: 1, windowElapsedMs: 0 });
		expect(f.records.find(record => record.kind === 'detail_open')).toMatchObject({ windowElapsedMs: 5_000 });
		expect(close(f)).toEqual([]);
		await vi.advanceTimersByTimeAsync(55_000);
		expect(close(f)).toEqual([expect.objectContaining({ complete: true, pendingActions: 0, endReason: 'completed', windowElapsedMs: 60_000 })]);
	});

	test('keeps one ordered manifest across stopped viewport collection, same-document navigation and remount', async () => {
		const f = fixture();
		f.registry.viewport(viewport(), 1);
		await vi.advanceTimersByTimeAsync(1_000);
		f.registry.viewport({ ...viewport(context(), 1, 1_000), ended: true }, 1);
		history.pushState({}, '', '/notes/note-entry-a');
		f.registry.record(context(), { kind: 'detail_open' });
		f.registry.viewport(viewport({ ...context(), eventId: 'remounted-display' }), 1);
		await vi.advanceTimersByTimeAsync(59_000);
		expect(opens(f)).toHaveLength(1);
		const attached = f.records.filter(record => record.windowId === opens(f)[0].windowId);
		expect(attached.map(record => record.windowSequence)).toEqual(attached.map((_, index) => index));
		expect(close(f)).toEqual([expect.objectContaining({ complete: true, recordCount: attached.length, windowSequence: attached.length - 1 })]);
		expect(attached.filter(record => record.kind === 'window').every(record => record.eventId === record.windowId)).toBe(true);
	});

	test.each(['blur', 'pagehide', 'beforeunload', 'hidden', 'account', 'dispose'] as const)('interrupts on %s without reopening the same entry', async cause => {
		const f = fixture();
		f.registry.viewport(viewport(), 1);
		await vi.advanceTimersByTimeAsync(3_000);
		if (cause === 'hidden') { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); } else if (cause === 'account') { f.account('bob'); await vi.advanceTimersByTimeAsync(1_000); } else if (cause === 'dispose') f.registry.dispose();
		else window.dispatchEvent(new Event(cause));
		await vi.advanceTimersByTimeAsync(60_000);
		expect(close(f)).toHaveLength(1);
		expect(close(f)[0]).toMatchObject({ complete: false });
		f.registry.viewport(viewport(), 1);
		expect(opens(f)).toHaveLength(1);
	});

	test.each(['ctrl', 'meta', 'middle', 'blank'] as const)('interrupts recommendation navigation to another document by %s', async method => {
		const f = fixture();
		f.registry.viewport(viewport(), 1);
		const link = document.createElement('a');
		link.href = `/notes/${context().noteId}?hanami=${context().eventId}`;
		if (method === 'blank') link.target = '_blank';
		document.body.append(link);
		link.addEventListener('click', event => event.preventDefault());
		link.addEventListener('auxclick', event => event.preventDefault());
		link.dispatchEvent(new MouseEvent(method === 'middle' ? 'auxclick' : 'click', { bubbles: true, cancelable: true, ctrlKey: method === 'ctrl', metaKey: method === 'meta', button: method === 'middle' ? 1 : 0 }));
		await vi.advanceTimersByTimeAsync(60_000);
		expect(close(f)).toEqual([expect.objectContaining({ complete: false })]);
	});

	test('does not interrupt for ordinary SPA navigation or an unrelated new-tab link', async () => {
		const f = fixture();
		f.registry.viewport(viewport(), 1);
		for (const href of [`/notes/${context().noteId}?hanami=${context().eventId}`, '/notes/unrelated']) {
			const link = document.createElement('a'); link.href = href; document.body.append(link);
			link.addEventListener('click', event => event.preventDefault());
			link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: href.endsWith('unrelated') }));
		}
		await vi.advanceTimersByTimeAsync(60_000);
		expect(close(f)).toEqual([expect.objectContaining({ complete: true })]);
	});

	test('keeps unresolved operations from before window start incomplete', async () => {
		const f = fixture();
		const handle = f.registry.beginOperation(context());
		await vi.advanceTimersByTimeAsync(100);
		f.registry.viewport(viewport(), 1);
		handle.succeeded({ kind: 'share' });
		await vi.advanceTimersByTimeAsync(60_000);
		expect(close(f)).toEqual([expect.objectContaining({ complete: false })]);
	});

	test('pending at deadline remains incomplete when success arrives before a delayed timer callback', async () => {
		const f = fixture();
		f.registry.viewport(viewport(), 1);
		await vi.advanceTimersByTimeAsync(59_000);
		const handle = f.registry.beginOperation(context());
		const monotonic = performance.now();
		vi.spyOn(performance, 'now').mockReturnValue(monotonic + 1_010);
		vi.setSystemTime(baseTime + 60_010);
		handle.succeeded({ kind: 'share' });
		await vi.advanceTimersByTimeAsync(1_000);
		expect(close(f)).toEqual([expect.objectContaining({ complete: false })]);
		const success = f.records.find(record => record.kind === 'share');
		expect(success).toBeDefined();
		expect(success).not.toHaveProperty('windowId');
	});

	test('operations begun after completion never add to the sealed manifest', async () => {
		const f = fixture();
		f.registry.viewport(viewport(), 1);
		await vi.advanceTimersByTimeAsync(60_000);
		const sealed = { ...close(f)[0] };
		f.registry.beginOperation(context()).succeeded({ kind: 'link_copy' });
		expect(f.records.at(-1)).toMatchObject({ kind: 'link_copy' });
		expect(f.records.at(-1)).not.toHaveProperty('windowId');
		expect(close(f)).toEqual([sealed]);
	});

	/** Oracle: contract §6/§8 excludes work first begun after 60000ms, even if its close timer has not run. Work already pending at 59999ms is incomplete at the deadline. The 1010ms heartbeat gap is valid in both examples. */
	test.each([
		{ startedAt: 59_999, outcome: 'success', complete: false, pendingActions: 1 },
		{ startedAt: 59_999, outcome: 'pending', complete: false, pendingActions: 1 },
		{ startedAt: 60_010, outcome: 'success', complete: true, pendingActions: 0 },
		{ startedAt: 60_010, outcome: 'pending', complete: true, pendingActions: 0 },
	])('seals by operation start at $startedAt ms before a delayed timer with outcome=$outcome', async ({ startedAt, outcome, complete, pendingActions }) => {
		const f = fixture();
		f.registry.viewport(viewport(), 1);
		await vi.advanceTimersByTimeAsync(59_000);
		expect(close(f)).toEqual([]);
		const clock = vi.spyOn(performance, 'now').mockReturnValue(startedAt);
		vi.setSystemTime(baseTime + startedAt);
		const handle = f.registry.beginOperation(context());
		clock.mockReturnValue(60_010);
		vi.setSystemTime(baseTime + 60_010);
		if (outcome === 'success') handle.succeeded({ kind: 'share' });
		await vi.advanceTimersByTimeAsync(1_000);
		expect(close(f)).toEqual([expect.objectContaining({ complete, pendingActions, endReason: complete ? 'completed' : 'pending_action', windowElapsedMs: 60_000 })]);
		if (outcome === 'success') {
			const success = f.records.find(record => record.kind === 'share');
			expect(success).toBeDefined();
			expect(success).not.toHaveProperty('windowId');
		}
	});

	/** Oracle: contract §6 cancels completeness after a real heartbeat gap over 2000ms. With the last checkpoint at 59000, a callback at 62010 has a 3010ms gap; clamping wire elapsed to 60000 cannot erase it. A callback at 60010 has a valid 1010ms gap. Ordinary observations after the deadline remain window-free. */
	test.each([
		{ observedAt: 60_010, path: 'record', complete: true },
		{ observedAt: 60_010, path: 'viewport', complete: true },
		{ observedAt: 60_010, path: 'operation', complete: true },
		{ observedAt: 62_010, path: 'record', complete: false },
		{ observedAt: 62_010, path: 'viewport', complete: false },
		{ observedAt: 62_010, path: 'operation', complete: false },
	])('checks heartbeat continuity for $path at $observedAt ms before the timer', async ({ observedAt, path, complete }) => {
		const f = fixture();
		f.registry.viewport(viewport(), 1);
		await vi.advanceTimersByTimeAsync(59_000);
		expect(f.records.at(-1)).toMatchObject({ kind: 'window', phase: 'checkpoint', windowElapsedMs: 59_000 });
		vi.spyOn(performance, 'now').mockReturnValue(observedAt);
		vi.setSystemTime(baseTime + observedAt);
		if (path === 'record') f.registry.record(context(), { kind: 'detail_open' });
		else if (path === 'viewport') f.registry.viewport(viewport(context(), 1, observedAt), 1);
		else f.registry.beginOperation(context()).succeeded({ kind: 'link_copy' });
		expect(close(f)).toEqual([expect.objectContaining({ complete, windowElapsedMs: 60_000, occurredAtMs: baseTime + observedAt })]);
		expect(f.records.at(-1)).not.toHaveProperty('windowId');
		const sealed = { ...close(f)[0] };
		await vi.advanceTimersByTimeAsync(1_000);
		expect(close(f)).toEqual([sealed]);
	});

	test.each(['cancelled', 'uncertain'] as const)('distinguishes the %s API outcome from pending work', async outcome => {
		const f = fixture();
		f.registry.viewport(viewport(), 1);
		f.registry.beginOperation(context())[outcome]();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(close(f)).toEqual([expect.objectContaining({ complete: outcome === 'cancelled', pendingActions: 0 })]);
	});

	test('API-uncertain feedback never creates a new receipt after a later retry ACK', async () => {
		const f = fixture();
		f.registry.viewport(viewport(), 1);
		const handle = f.registry.beginOperation(context());
		await vi.advanceTimersByTimeAsync(5_000);
		handle.uncertain();
		await vi.advanceTimersByTimeAsync(35_000);
		handle.succeededFeedback('original-feedback');
		await vi.advanceTimersByTimeAsync(20_000);
		expect(f.records.filter(record => record.kind === 'feedback')).toEqual([]);
		expect(close(f)).toEqual([expect.objectContaining({ complete: false })]);
	});

	test('first feedback success after the window expires is a normal receipt without window fields', async () => {
		const f = fixture();
		f.registry.viewport(viewport(), 1);
		const handle = f.registry.beginOperation(context());
		await vi.advanceTimersByTimeAsync(61_000);
		handle.succeededFeedback('late-first-success');
		expect(f.records.at(-1)).toMatchObject({ kind: 'feedback', eventId: 'late-first-success', occurredAtMs: baseTime + 61_000 });
		expect(f.records.at(-1)).not.toHaveProperty('windowId');
		expect(close(f)).toEqual([expect.objectContaining({ complete: false })]);
	});

	test('successful mute, block, report and feedback operations preserve completeness', async () => {
		const f = fixture();
		f.registry.viewport(viewport(), 1);
		for (const action of ['mute', 'block', 'report'] as const) f.registry.beginOperation(context()).succeeded({ kind: 'action', action });
		f.registry.beginOperation(context()).succeededFeedback('saved-less');
		await vi.advanceTimersByTimeAsync(60_000);
		expect(close(f)).toEqual([expect.objectContaining({ complete: true })]);
	});

	test('a resolved handle cannot record the same operation twice', async () => {
		const f = fixture();
		f.registry.viewport(viewport(), 1);
		const operation = f.registry.beginOperation(context());
		operation.succeeded({ kind: 'link_copy' });
		operation.succeeded({ kind: 'link_copy' });
		const feedback = f.registry.beginOperation(context());
		feedback.succeededFeedback('one-saved-feedback');
		feedback.succeededFeedback('one-saved-feedback');
		await vi.advanceTimersByTimeAsync(60_000);
		expect(f.records.filter(record => record.kind === 'link_copy')).toHaveLength(1);
		expect(f.records.filter(record => record.kind === 'feedback')).toHaveLength(1);
		expect(close(f)).toEqual([expect.objectContaining({ complete: true })]);
	});

	test('consumes an ordinal before queue rejection and never packs later records into that gap', async () => {
		const f = fixture();
		f.registry.viewport(viewport(), 1);
		f.reject(true);
		f.registry.record(context(), { kind: 'detail_open' });
		const rejected = f.attempted.at(-1);
		f.reject(false);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(close(f)).toEqual([expect.objectContaining({ complete: false })]);
		expect(f.records.some(record => record.windowId === rejected?.windowId && record.windowSequence === rejected?.windowSequence)).toBe(false);
	});

	test('drop before close marks incomplete while an ACK-only drop after close leaves it frozen', async () => {
		const f = fixture();
		f.registry.viewport(viewport(), 1);
		const dropped = { ...f.records[1] } as HanamiObservation;
		f.registry.dropped([dropped], 'retry_exhausted');
		await vi.advanceTimersByTimeAsync(60_000);
		expect(close(f)).toEqual([expect.objectContaining({ complete: false })]);
		const other = fixture();
		other.registry.viewport(viewport(), 1);
		await vi.advanceTimersByTimeAsync(60_000);
		const frozen = { ...close(other)[0] };
		other.registry.dropped(other.records as unknown as HanamiObservation[], 'retry_exhausted');
		expect(close(other)).toEqual([frozen]);
		expect(frozen.complete).toBe(true);
	});

	test('a timer gap cannot be hidden by filling in missed checkpoints', async () => {
		const f = fixture();
		f.registry.viewport(viewport(), 1);
		const monotonic = performance.now();
		vi.spyOn(performance, 'now').mockReturnValue(monotonic + 2_001);
		await vi.advanceTimersByTimeAsync(1_000);
		expect(close(f)).toEqual([expect.objectContaining({ complete: false, endReason: 'timer_gap' })]);
	});

	test('active-window and record budgets preserve ordinary v4 observations', async () => {
		const f = fixture();
		for (let index = 0; index < 21; index++) expect(f.registry.viewport(viewport(context(`entry-${index}`)), index + 1)).toBe(true);
		expect(opens(f)).toHaveLength(20);
		expect(f.records.find(record => record.kind === 'viewport' && record.entryId === 'entry-20')).not.toHaveProperty('windowId');
		const firstId = opens(f)[0].windowId;
		for (let index = 0; index < 410; index++) f.registry.record(context('entry-0'), { kind: 'detail_open' });
		expect(f.records.filter(record => record.windowId === firstId).length).toBeLessThanOrEqual(400);
		expect(close(f).find(record => record.windowId === firstId)).toMatchObject({ complete: false, endReason: 'budget_exhausted' });
		expect(f.records.at(-1)).toMatchObject({ kind: 'detail_open' });
		expect(f.records.at(-1)).not.toHaveProperty('windowId');
	});
});
