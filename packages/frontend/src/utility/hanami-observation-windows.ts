import type { HanamiDisplayEvent, HanamiInteraction, HanamiObservation, HanamiViewportObservation, HanamiWindowEndReason, HanamiWindowMetadata, HanamiWindowObservation } from '@/utility/hanami-impressions.js';
import { hanamiObservationTime } from '@/utility/hanami-impressions.js';
import { captureHanamiDeviceContext } from '@/utility/hanami-device-context.js';

export type HanamiOperationHandle = {
	succeeded: (interaction: HanamiInteraction) => void;
	succeededFeedback: (originalEventId: string) => void;
	cancelled: () => void;
	uncertain: () => void;
};
type EntryWindow = {
	context: HanamiDisplayEvent;
	id: string;
	start: number;
	lastBeat: number;
	next: number;
	closed: boolean;
	reason?: HanamiWindowEndReason;
	timer?: number;
};

export function createHanamiObservationWindows(options: {
	enqueue: (record: HanamiObservation) => boolean;
	accountId: () => string | undefined;
	contextForNote?: (token: string, noteId: string) => HanamiDisplayEvent | undefined;
}) {
	const account = options.accountId();
	const windows = new Map<string, EntryWindow>();
	const pending = new Map<string, Set<object>>();
	let disposed = false;
	const key = (context: HanamiDisplayEvent) => JSON.stringify([context.snapshotId, context.entryId]);
	const elapsed = (value: EntryWindow) => Math.max(0, Math.min(60_000, Math.floor(performance.now() - value.start)));
	const ownsAccount = () => account !== undefined && account === options.accountId();
	const identity = (context: HanamiDisplayEvent): HanamiDisplayEvent => ({ eventId: context.eventId, snapshotId: context.snapshotId, entryId: context.entryId, noteId: context.noteId });

	function metadata(value: EntryWindow): HanamiWindowMetadata {
		return { windowId: value.id, windowSequence: value.next++, windowElapsedMs: elapsed(value) };
	}

	function emitWindow(value: EntryWindow, phase: { phase: 'open'; displayPosition: number } | { phase: 'checkpoint' } | { phase: 'close'; recordCount: number; complete: boolean; pendingActions: number; endReason: HanamiWindowEndReason }) {
		const record: HanamiWindowObservation = { ...value.context, eventId: value.id, ...hanamiObservationTime(), deviceContext: captureHanamiDeviceContext(), ...metadata(value), kind: 'window', ...(phase.phase === 'open' ? { ...phase, windowSequence: 0, windowElapsedMs: 0 } : phase) };
		const accepted = options.enqueue(record);
		if (!accepted) value.reason = 'delivery_failed';
		return accepted;
	}

	function close(value: EntryWindow, reason?: HanamiWindowEndReason) {
		if (value.closed) return;
		value.closed = true;
		if (value.timer !== undefined) window.clearTimeout(value.timer);
		const pendingActions = pending.get(key(value.context))?.size ?? 0;
		const endReason = reason ?? value.reason ?? (pendingActions > 0 ? 'pending_action' : 'completed');
		emitWindow(value, { phase: 'close', recordCount: value.next + 1, complete: endReason === 'completed' && elapsed(value) === 60_000, pendingActions, endReason });
	}

	function tick(value: EntryWindow) {
		if (value.closed) return;
		const now = performance.now();
		if (!ownsAccount()) { close(value, 'interrupted'); return; }
		if (now - value.lastBeat > 2000) { close(value, 'timer_gap'); return; }
		if (now - value.start >= 60_000) { close(value); return; }
		if (value.next >= 399) { close(value, 'budget_exhausted'); return; }
		value.lastBeat = now;
		emitWindow(value, { phase: 'checkpoint' });
		value.timer = window.setTimeout(() => tick(value), Math.min(1000, 60_000 - elapsed(value)));
	}

	function activeWindow(context: HanamiDisplayEvent) {
		const value = windows.get(key(context));
		if (!value || value.closed) return;
		if (!ownsAccount()) { close(value, 'interrupted'); return; }
		const now = performance.now();
		if (now - value.lastBeat > 2000) { close(value, 'timer_gap'); return; }
		if (now - value.start >= 60_000) { close(value); return; }
		if (value.next >= 399) { close(value, 'budget_exhausted'); return; }
		return value;
	}

	function enqueue(record: Exclude<HanamiObservation, { kind: 'window' }>) {
		const value = activeWindow(record);
		const accepted = options.enqueue(value ? { ...record, ...metadata(value) } : record);
		if (!accepted && value) value.reason = 'delivery_failed';
		return accepted;
	}

	function record(context: HanamiDisplayEvent, interaction: HanamiInteraction | { kind: 'feedback' }, eventId: string = crypto.randomUUID()) {
		if (disposed || !ownsAccount()) return;
		enqueue({ ...identity(context), eventId, ...hanamiObservationTime(), deviceContext: captureHanamiDeviceContext(), ...interaction });
	}

	function interrupt(context?: HanamiDisplayEvent) {
		for (const value of windows.values()) if (!context || key(value.context) === key(context)) close(value, 'interrupted');
	}

	function hidden() { if (window.document.hidden) interrupt(); }

	function navigation(event: MouseEvent) {
		if (!ownsAccount()) return;
		const anchor = event.target instanceof Element ? event.target.closest('a') : null;
		if (!anchor) return;
		const separateShiftDocument = event.shiftKey && (event.altKey || anchor.dataset.hanamiShiftNavigation !== 'same-document');
		if (!(event.ctrlKey || event.metaKey || separateShiftDocument || event.button === 1 || anchor.target === '_blank')) return;
		const target = new URL(anchor.href, window.location.href);
		const token = target.searchParams.get('hanami');
		if (!token) return;
		for (const value of windows.values()) {
			const context = options.contextForNote?.(token, value.context.noteId);
			if (token === value.context.eventId || (context && key(context) === key(value.context))) interrupt(value.context);
		}
	}

	window.addEventListener('blur', interruptAll);
	window.addEventListener('pagehide', interruptAll);
	window.addEventListener('beforeunload', interruptAll);
	window.document.addEventListener('visibilitychange', hidden);
	window.document.addEventListener('click', navigation, true);
	window.document.addEventListener('auxclick', navigation, true);

	function interruptAll() { interrupt(); }

	return {
		viewport(observation: HanamiViewportObservation, displayPosition: number): boolean {
			if (disposed || !ownsAccount()) return false;
			const id = key(observation);
			if (!windows.has(id) && observation.documentVisible && observation.availableArea > 0 && observation.visibleArea > 0 && [...windows.values()].filter(value => !value.closed).length < 20) {
				const now = performance.now();
				const value: EntryWindow = { context: identity(observation), id: crypto.randomUUID(), start: now, lastBeat: now, next: 0, closed: false, ...(pending.get(id)?.size ? { reason: 'pending_action' } : {}) };
				windows.set(id, value);
				if (emitWindow(value, { phase: 'open', displayPosition })) value.timer = window.setTimeout(() => tick(value), 1000);
				else value.closed = true;
			}
			return enqueue(observation);
		},
		record,
		beginOperation(context: HanamiDisplayEvent): HanamiOperationHandle {
			activeWindow(context);
			const operation = {};
			const id = key(context);
			const items = pending.get(id) ?? new Set<object>();
			let resolved = false;
			let uncertain = false;
			if (!windows.get(id)?.closed) {
				pending.set(id, items);
				items.add(operation);
			}

			function finish() {
				// A delayed timer must see work still pending at the deadline before it is removed.
				activeWindow(context);
				items.delete(operation);
			}

			return {
				succeeded(interaction) {
					if (resolved) return;
					finish(); resolved = true;
					record(context, interaction);
				},
				succeededFeedback(originalEventId) {
					if (resolved || uncertain) return;
					finish(); resolved = true;
					record(context, { kind: 'feedback' }, originalEventId);
				},
				cancelled() { if (!resolved) { finish(); resolved = true; } },
				uncertain() {
					if (resolved || uncertain) return;
					const value = activeWindow(context);
					if (value) value.reason = 'pending_action';
					finish(); uncertain = true;
				},
			};
		},
		dropped(records: readonly HanamiObservation[], _reason: string) {
			const ids = new Set(records.map(item => item.windowId));
			for (const value of windows.values()) if (!value.closed && ids.has(value.id)) value.reason = 'delivery_failed';
		},
		interrupt,
		dispose() {
			if (disposed) return;
			interrupt(); disposed = true;
			window.removeEventListener('blur', interruptAll);
			window.removeEventListener('pagehide', interruptAll);
			window.removeEventListener('beforeunload', interruptAll);
			window.document.removeEventListener('visibilitychange', hidden);
			window.document.removeEventListener('click', navigation, true);
			window.document.removeEventListener('auxclick', navigation, true);
		},
	};
}
