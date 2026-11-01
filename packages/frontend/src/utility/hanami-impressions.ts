import type { Endpoints } from 'misskey-js';

export type HanamiObservation = Extract<Endpoints['hanami-impressions']['req'], { version: 2 }>['observations'][number];
export type HanamiDisplayEvent = Pick<HanamiObservation, 'eventId' | 'snapshotId' | 'entryId'>;

type Geometry = Pick<HanamiObservation, 'visibleArea' | 'availableArea' | 'documentVisible'>;
type Entry = { event: HanamiDisplayEvent; start: number; sequence: number; active: boolean; last?: Geometry };

export function createHanamiImpressionTracker(options: { onObservation: (record: HanamiObservation) => boolean | void }) {
	const entries = new Map<Element, Entry>();
	const completed = new Set<string>();
	const series = new Map<string, string>();
	let disconnected = false;
	let paused = false;
	let pageHidden = false;
	const key = (event: HanamiDisplayEvent) => JSON.stringify([event.snapshotId, event.entryId]);
	const documentVisible = () => !window.document.hidden && window.document.visibilityState === 'visible';

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
		if (!entry.active || completed.has(key(entry.event)) || paused) return;
		const current = geometry(element);
		if (!ended && !checkpoint && entry.last && current.availableArea === entry.last.availableArea && current.visibleArea === entry.last.visibleArea && current.documentVisible === entry.last.documentVisible) return;
		const observedAt = performance.now();
		if (entry.sequence === 0) entry.start = observedAt;
		const record = { ...entry.event, sequence: entry.sequence, elapsedMs: Math.max(0, Math.floor(observedAt - entry.start)), ...current, ended };
		if (options.onObservation(record) === false) {
			paused = true;
			for (const value of entries.values()) value.active = false;
			return;
		}
		entry.sequence++;
		entry.last = current;
		if (ended) entry.active = false;
	}

	function begin(element: Element, entry: Entry, fresh: boolean) {
		if (disconnected || paused || pageHidden || !documentVisible() || completed.has(key(entry.event))) return;
		if (fresh) entry.event = { ...entry.event, eventId: crypto.randomUUID() };
		series.set(entry.event.eventId, key(entry.event));
		entry.sequence = 0;
		entry.active = true;
		entry.last = undefined;
		emit(element, entry, false);
	}

	function update() {
		if (disconnected) return;
		for (const [element, entry] of entries) emit(element, entry, false);
	}

	function resume() {
		if (disconnected || pageHidden || !documentVisible()) return;
		paused = false;
		for (const [element, entry] of entries) if (!entry.active) begin(element, entry, true);
	}

	function endAll() {
		for (const [element, entry] of entries) emit(element, entry, true);
	}

	function visibilityChanged() {
		if (documentVisible()) resume();
		else endAll();
	}

	function pagehide() { endAll(); pageHidden = true; }

	function pageshow() { pageHidden = false; resume(); }

	const observer = new IntersectionObserver(update, { threshold: [0, 1] });
	const timer = window.setInterval(() => {
		if (!disconnected) for (const [element, entry] of entries) emit(element, entry, false, true);
	}, 250);
	// 長いカードは交差率の境界に届かず、スクロールだけではobserverが再通知しない。
	window.addEventListener('scroll', update, { capture: true, passive: true });
	window.addEventListener('resize', update);
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
			const entry: Entry = { event, start: 0, sequence: 0, active: false };
			entries.set(element, entry);
			observer.observe(element);
			begin(element, entry, series.has(event.eventId));
		},
		unobserve,
		complete(eventIds: string[]) {
			for (const id of eventIds) {
				const value = series.get(id);
				if (value) completed.add(value);
			}
			for (const entry of entries.values()) if (completed.has(key(entry.event))) entry.active = false;
		},
		resume,
		disconnect() {
			if (disconnected) return;
			endAll();
			disconnected = true;
			entries.clear();
			observer.disconnect();
			window.clearInterval(timer);
			window.removeEventListener('scroll', update, true);
			window.removeEventListener('resize', update);
			window.document.removeEventListener('visibilitychange', visibilityChanged);
			window.removeEventListener('pagehide', pagehide);
			window.removeEventListener('pageshow', pageshow);
		},
	};
}
