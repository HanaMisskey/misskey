import { captureHanamiDeviceContext } from '@/utility/hanami-device-context.js';
import type { HanamiDeviceContext } from '@/utility/hanami-device-context.js';

export type HanamiDisplayEvent = { eventId: string; snapshotId: string; entryId: string; noteId: string };
type ObservationTime = { occurredAtMs: number; utcOffsetMinutes: number };
export type HanamiWindowMetadata = { windowId: string; windowSequence: number; windowElapsedMs: number };
type ObservationContext = ObservationTime & { deviceContext?: HanamiDeviceContext } & Partial<HanamiWindowMetadata>;
export type HanamiWindowEndReason = 'completed' | 'interrupted' | 'pending_action' | 'delivery_failed' | 'budget_exhausted' | 'timer_gap';
export type HanamiWindowObservation = HanamiDisplayEvent & ObservationContext & HanamiWindowMetadata & { kind: 'window' } & (
	| { phase: 'open'; displayPosition: number; windowSequence: 0; windowElapsedMs: 0 }
	| { phase: 'checkpoint' }
	| { phase: 'close'; recordCount: number; complete: boolean; pendingActions: number; endReason: HanamiWindowEndReason }
);
export type HanamiInteraction =
	| { kind: 'detail_open' | 'link_copy' | 'share' }
	| { kind: 'image_open'; fileId: string }
	| { kind: 'action'; action: 'reply' | 'quote'; evidenceNoteId: string }
	| { kind: 'action'; action: 'follow' | 'mute' | 'block' | 'report' };
export type HanamiViewportObservation = HanamiDisplayEvent & ObservationContext & {
	kind: 'viewport'; sequence: number; elapsedMs: number; visibleArea: number; availableArea: number;
	documentVisible: boolean; ended: boolean; focused: boolean; activityAgeMs: number; scrollIdleMs: number;
};
export type HanamiObservation = HanamiViewportObservation | HanamiWindowObservation | (HanamiDisplayEvent & ObservationContext & (HanamiInteraction | { kind: 'feedback' }));

export function hanamiObservationTime(): ObservationTime {
	const now = new Date();
	return { occurredAtMs: now.getTime(), utcOffsetMinutes: -now.getTimezoneOffset() };
}

type Geometry = Pick<HanamiViewportObservation, 'visibleArea' | 'availableArea' | 'documentVisible'>;
type Entry = { event: HanamiDisplayEvent; start: number; geometryChangedAt: number; sequence: number; active: boolean; capped: boolean; blocked: boolean; last?: Geometry };

function sameGeometry(previous: Geometry | undefined, current: Geometry): boolean {
	return previous != null && current.availableArea === previous.availableArea && current.visibleArea === previous.visibleArea && current.documentVisible === previous.documentVisible;
}

export function createHanamiImpressionTracker(options: { onObservation: (record: HanamiViewportObservation) => boolean | void }) {
	const entries = new Map<Element, Entry>();
	let lastActivity: number | undefined;
	let lastScroll: number | undefined;
	let focused = window.document.hasFocus();
	const series = new Map<string, string>();
	let disconnected = false;
	let paused = false;
	let pageHidden = false;
	const key = (event: HanamiDisplayEvent) => JSON.stringify([event.snapshotId, event.entryId]);
	const documentVisible = () => !window.document.hidden && window.document.visibilityState === 'visible';
	let wasDocumentVisible = documentVisible();

	function geometry(element: Element): Geometry {
		const rect = element.getBoundingClientRect();
		let left = 0;
		let top = 0;
		let right = window.innerWidth;
		let bottom = window.innerHeight;
		for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
			const style = window.getComputedStyle(ancestor);
			const clipsX = ['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowX);
			const clipsY = ['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowY);
			if (!clipsX && !clipsY) continue;
			const bounds = ancestor.getBoundingClientRect();
			if (clipsX) {
				left = Math.max(left, bounds.left + ancestor.clientLeft);
				right = Math.min(right, bounds.left + ancestor.clientLeft + ancestor.clientWidth);
			}
			if (clipsY) {
				top = Math.max(top, bounds.top + ancestor.clientTop);
				bottom = Math.min(bottom, bounds.top + ancestor.clientTop + ancestor.clientHeight);
			}
		}
		const width = Math.max(0, right - left);
		const height = Math.max(0, bottom - top);
		const availableArea = Math.min(rect.width, width) * Math.min(rect.height, height);
		const visibleArea = Math.max(0, Math.min(right, rect.right) - Math.max(left, rect.left)) * Math.max(0, Math.min(bottom, rect.bottom) - Math.max(top, rect.top));
		return { availableArea, visibleArea, documentVisible: documentVisible() };
	}

	function emit(element: Element, entry: Entry, ended: boolean, checkpoint = false) {
		if (!entry.active || entry.capped || paused) return;
		const current = geometry(element);
		const observedAt = performance.now();
		if (entry.sequence === 0) entry.start = observedAt;
		const changed = !sameGeometry(entry.last, current);
		if (changed) entry.geometryChangedAt = observedAt;
		entry.capped = entry.sequence >= 7201 || observedAt - entry.start >= 30 * 60_000;
		ended ||= entry.capped;
		ended ||= checkpoint && observedAt - entry.geometryChangedAt >= 1_000 && (lastActivity === undefined || observedAt - lastActivity >= 60_000);
		if (!ended && !checkpoint && !changed) return;
		const record: HanamiViewportObservation = {
			...entry.event, ...hanamiObservationTime(), kind: 'viewport', sequence: entry.sequence,
			deviceContext: captureHanamiDeviceContext(),
			elapsedMs: Math.max(0, Math.floor(observedAt - entry.start)), ...current, ended, focused,
			activityAgeMs: lastActivity === undefined ? Number.MAX_SAFE_INTEGER : Math.max(0, Math.floor(observedAt - lastActivity)),
			scrollIdleMs: lastScroll === undefined ? Number.MAX_SAFE_INTEGER : Math.max(0, Math.floor(observedAt - lastScroll)),
		};
		if (options.onObservation(record) === false) {
			paused = true;
			for (const value of entries.values()) {
				value.blocked ||= value.active;
				value.active = false;
			}
			return;
		}
		entry.sequence++;
		entry.last = current;
		if (ended) entry.active = false;
	}

	function begin(element: Element, entry: Entry, fresh: boolean) {
		if (disconnected || pageHidden || !documentVisible() || entry.capped) return;
		if (paused) {
			entry.blocked = true;
			return;
		}
		if (fresh) entry.event = { ...entry.event, eventId: crypto.randomUUID() };
		series.set(entry.event.eventId, key(entry.event));
		entry.sequence = 0;
		entry.active = true;
		entry.blocked = false;
		entry.last = undefined;
		emit(element, entry, false);
	}

	function update() {
		if (disconnected) return;
		for (const [element, entry] of entries) {
			if (entry.active) emit(element, entry, false);
			else if (!entry.capped && !sameGeometry(entry.last, geometry(element))) begin(element, entry, true);
		}
	}

	function resume() {
		if (!paused || disconnected || pageHidden || !documentVisible()) return;
		paused = false;
		for (const [element, entry] of entries) if (entry.blocked) begin(element, entry, true);
	}

	function restartInactive() {
		for (const [element, entry] of entries) if (!entry.active) begin(element, entry, true);
	}

	function endAll() {
		for (const [element, entry] of entries) emit(element, entry, true);
	}

	function visibilityChanged() {
		const visible = documentVisible();
		const changed = visible !== wasDocumentVisible;
		wasDocumentVisible = visible;
		if (!visible) endAll();
		else if (changed) restartInactive();
	}

	function activity(event: Event) {
		if (!event.isTrusted) return;
		lastActivity = performance.now();
		restartInactive();
	}

	function scroll() { lastScroll = performance.now(); update(); }

	function blur() {
		if (!focused) return;
		focused = false;
		endAll();
		restartInactive();
	}

	function focus() {
		const changed = !focused;
		focused = true;
		if (changed) restartInactive();
	}

	function pagehide() { endAll(); pageHidden = true; }

	function pageshow() {
		const changed = pageHidden;
		pageHidden = false;
		if (changed) restartInactive();
	}

	const observer = new IntersectionObserver(update, { threshold: [0, 1] });
	const timer = window.setInterval(() => {
		if (!disconnected) for (const [element, entry] of entries) emit(element, entry, false, true);
	}, 250);
	// 長いカードは交差率の境界に届かず、スクロールだけではobserverが再通知しない。
	window.addEventListener('scroll', scroll, { capture: true, passive: true });
	window.addEventListener('resize', update);
	window.addEventListener('blur', blur);
	window.addEventListener('focus', focus);
	for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(type, activity, { capture: true, passive: true });
	window.document.addEventListener('visibilitychange', visibilityChanged);
	window.addEventListener('pagehide', pagehide);
	window.addEventListener('pageshow', pageshow);

	function unobserve(element: Element) {
		const entry = entries.get(element);
		if (entry) emit(element, entry, true);
		entries.delete(element);
		observer.unobserve(element);
	}

	return {
		observe(element: Element, event: HanamiDisplayEvent) {
			const existing = entries.get(element);
			if (existing && key(existing.event) === key(event)) return;
			unobserve(element);
			const entry: Entry = { event, start: 0, geometryChangedAt: 0, sequence: 0, active: false, capped: false, blocked: false };
			entries.set(element, entry);
			observer.observe(element);
			begin(element, entry, series.has(event.eventId));
		},
		unobserve,
		resume,
		disconnect() {
			if (disconnected) return;
			endAll();
			disconnected = true;
			entries.clear();
			observer.disconnect();
			window.clearInterval(timer);
			window.removeEventListener('scroll', scroll, true);
			window.removeEventListener('blur', blur);
			window.removeEventListener('focus', focus);
			for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart']) window.removeEventListener(type, activity, true);
			window.removeEventListener('resize', update);
			window.document.removeEventListener('visibilitychange', visibilityChanged);
			window.removeEventListener('pagehide', pagehide);
			window.removeEventListener('pageshow', pageshow);
		},
	};
}
