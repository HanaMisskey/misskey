import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createHanamiImpressionTracker } from '@/utility/hanami-impressions.js';

type DisplayEvent = { eventId: string; snapshotId: string; entryId: string };
const event: DisplayEvent = { eventId: 'event1', snapshotId: 'snapshot1', entryId: 'entry1' };
let visibility = 'visible';
let viewportWidth = 100;
let viewportHeight = 100;
let observers: FakeObserver[] = [];

function rect(top = 0, height = 100, width = 100, left = 0): DOMRectReadOnly {
	return { x: left, y: top, top, left, right: left + width, bottom: top + height, width, height, toJSON: () => ({}) };
}

class FakeObserver {
	readonly root = null;
	readonly rootMargin = '0px';
	readonly thresholds = [0, 1];
	readonly elements = new Set<Element>();
	constructor(private callback: IntersectionObserverCallback) { observers.push(this); }
	observe = (element: Element) => { this.elements.add(element); };
	unobserve = (element: Element) => { this.elements.delete(element); };
	disconnect = () => { this.elements.clear(); };
	takeRecords = () => [];
	emit(element: Element, bounds: DOMRectReadOnly, intersection: DOMRectReadOnly) {
		if (!this.elements.has(element)) return;
		this.callback([{
			target: element, time: Date.now(), isIntersecting: intersection.height > 0,
			rootBounds: rect(0, viewportHeight, viewportWidth), boundingClientRect: bounds, intersectionRect: intersection,
			intersectionRatio: bounds.height * bounds.width === 0 ? 0 : (intersection.height * intersection.width) / (bounds.height * bounds.width),
		}], this as unknown as IntersectionObserver);
	}
}

function card(top = 0, height = 100, width = 100, left = 0) {
	let bounds = rect(top, height, width, left);
	const element = document.createElement('article');
	Object.defineProperty(element, 'getBoundingClientRect', { value: () => bounds });
	document.body.append(element);
	return {
		element,
		move(nextTop: number) { bounds = rect(nextTop, height, width, left); },
		visible(nextTop: number, nextHeight = height, nextWidth = width, nextLeft = left) {
			bounds = rect(nextTop, nextHeight, nextWidth, nextLeft);
			const visibleTop = Math.max(0, bounds.top);
			const visibleHeight = Math.max(0, Math.min(viewportHeight, bounds.bottom) - visibleTop);
			const visibleLeft = Math.max(0, bounds.left);
			const visibleWidth = Math.max(0, Math.min(viewportWidth, bounds.right) - visibleLeft);
			for (const observer of observers) observer.emit(element, bounds, rect(visibleTop, visibleHeight, visibleWidth, visibleLeft));
		},
	};
}

function pageWindow(top: number, height: number, width: number) {
	const layer = (bounds: DOMRectReadOnly, overflow: string, overflowY = overflow) => {
		const element = document.createElement('div');
		element.style.overflow = overflow;
		element.style.overflowY = overflowY;
		Object.defineProperties(element, {
			getBoundingClientRect: { value: () => bounds },
			clientWidth: { value: bounds.width },
			clientHeight: { value: bounds.height },
		});
		return element;
	};
	const body = layer(rect(top - 39, height + 39, width), 'clip');
	const content = layer(rect(top, height, width), 'auto');
	const scrollport = layer(rect(top, height, width), 'clip', 'scroll');
	body.append(content);
	content.append(scrollport);
	document.body.append(body);
	return scrollport;
}

beforeEach(() => {
	vi.useFakeTimers();
	visibility = 'visible';
	viewportWidth = 100;
	viewportHeight = 100;
	observers = [];
	vi.stubGlobal('IntersectionObserver', FakeObserver);
	Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
	Object.defineProperty(document, 'hidden', { configurable: true, get: () => visibility !== 'visible' });
	Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => viewportWidth });
	Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => viewportHeight });
	Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => viewportWidth });
	Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, get: () => viewportHeight });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

/** Oracle: the page API contract gives this observer geometry, monotonic timestamps and lifecycle only. Every nonempty or empty visible state is observable; adoption is acknowledged by the remote service. Browser layout is supplied as fixed rectangles because happy-dom does not lay out CSS. */
describe('raw recommendation display observations', () => {
	test('emits geometry immediately and checkpoints it without locally adopting the card', () => {
		const onObservation = vi.fn();
		const tracker = createHanamiImpressionTracker({ onObservation });
		const view = card(51);
		tracker.observe(view.element, event);
		expect(onObservation).toHaveBeenCalledExactlyOnceWith({ ...event, sequence: 0, elapsedMs: 0, visibleArea: 4_900, availableArea: 10_000, documentVisible: true, ended: false });
		vi.advanceTimersByTime(250);
		expect(onObservation.mock.calls.at(-1)?.[0]).toEqual({ ...event, sequence: 1, elapsedMs: 250, visibleArea: 4_900, availableArea: 10_000, documentVisible: true, ended: false });
		view.visible(50);
		expect(onObservation.mock.calls.at(-1)?.[0]).toMatchObject({ visibleArea: 5_000, availableArea: 10_000, ended: false });
		vi.advanceTimersByTime(1_000);
		expect(onObservation.mock.calls.at(-1)?.[0]).toMatchObject({ elapsedMs: 1_250, ended: false });
		tracker.disconnect();
	});

	/** Oracle: the page API contract starts each series at sequence=0/elapsedMs=0 and uses a monotonic clock. DOM reads occupy 100..107, 350..357 and 475..482ms on mount, or 1000..1007, 1250..1257 and 1375..1382ms after foreground return. Corresponding measurement phases are 250ms and 375ms apart, regardless of whether timestamps are taken before or after layout. */
	test.each([
		{ phase: 'initial mount', resume: false, checkpointAt: 350, scrollAt: 475 },
		{ phase: 'foreground return', resume: true, checkpointAt: 1_250, scrollAt: 1_375 },
	])('starts at zero and preserves elapsed time through layout work on $phase', ({ resume, checkpointAt, scrollAt }) => {
		let now = 100;
		let top = 0;
		const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
		const element = document.createElement('article');
		Object.defineProperty(element, 'getBoundingClientRect', { value: () => {
			now += 7;
			return rect(top);
		} });
		document.body.append(element);
		const onObservation = vi.fn();
		const tracker = createHanamiImpressionTracker({ onObservation });
		try {
			tracker.observe(element, event);
			if (resume) {
				now = 300;
				visibility = 'hidden';
				document.dispatchEvent(new Event('visibilitychange'));
				onObservation.mockClear();
				now = 1_000;
				visibility = 'visible';
				document.dispatchEvent(new Event('visibilitychange'));
			}
			const seriesId = onObservation.mock.calls[0][0].eventId;
			if (resume) expect(seriesId).not.toBe(event.eventId);
			else expect(seriesId).toBe(event.eventId);
			now = checkpointAt;
			vi.advanceTimersByTime(250);
			now = scrollAt;
			top = 10;
			window.dispatchEvent(new Event('scroll'));
			expect(onObservation.mock.calls.map(([record]) => [record.eventId, record.sequence, record.elapsedMs])).toEqual([
				[seriesId, 0, 0],
				[seriesId, 1, 250],
				[seriesId, 2, 375],
			]);
		} finally {
			tracker.disconnect();
			clock.mockRestore();
		}
	});

	test('records brief hidden geometry between checkpoints in sequence', () => {
		const onObservation = vi.fn();
		const tracker = createHanamiImpressionTracker({ onObservation });
		const view = card();
		tracker.observe(view.element, event);
		vi.advanceTimersByTime(100);
		view.visible(101);
		vi.advanceTimersByTime(20);
		view.visible(0);
		expect(onObservation.mock.calls.map(([record]) => [record.sequence, record.elapsedMs, record.visibleArea])).toEqual([[0, 0, 10_000], [1, 100, 0], [2, 120, 10_000]]);
		tracker.disconnect();
	});

	test('ends a hidden tab interval and begins a distinct series on foreground return', () => {
		const onObservation = vi.fn();
		const tracker = createHanamiImpressionTracker({ onObservation });
		const view = card();
		tracker.observe(view.element, event);
		vi.advanceTimersByTime(200);
		visibility = 'hidden';
		document.dispatchEvent(new Event('visibilitychange'));
		expect(onObservation.mock.calls.at(-1)?.[0]).toMatchObject({ ...event, elapsedMs: 200, documentVisible: false, ended: true });
		const count = onObservation.mock.calls.length;
		vi.advanceTimersByTime(2_000);
		expect(onObservation).toHaveBeenCalledTimes(count);
		visibility = 'visible';
		document.dispatchEvent(new Event('visibilitychange'));
		const resumed = onObservation.mock.calls.at(-1)?.[0];
		expect(resumed).toMatchObject({ snapshotId: event.snapshotId, entryId: event.entryId, sequence: 0, elapsedMs: 0, documentVisible: true, ended: false });
		expect(resumed.eventId).not.toBe(event.eventId);
		tracker.disconnect();
	});

	test('reports the actual scrollport area for a narrow tall card without an IO crossing', () => {
		viewportWidth = 1920;
		viewportHeight = 1080;
		const onObservation = vi.fn();
		const tracker = createHanamiImpressionTracker({ onObservation });
		const scrollport = pageWindow(400, 500, 600);
		const view = card(651, 3000, 600);
		scrollport.append(view.element);
		tracker.observe(view.element, event);
		expect(onObservation.mock.calls.at(-1)?.[0]).toMatchObject({ visibleArea: 149_400, availableArea: 300_000 });
		view.move(650);
		scrollport.dispatchEvent(new Event('scroll'));
		expect(onObservation.mock.calls.at(-1)?.[0]).toMatchObject({ visibleArea: 150_000, availableArea: 300_000 });
		tracker.disconnect();
	});

	test('reports zero exposure for a card clipped by its page window', () => {
		viewportWidth = 1920;
		viewportHeight = 1000;
		const onObservation = vi.fn();
		const tracker = createHanamiImpressionTracker({ onObservation });
		const scrollport = pageWindow(39, 461, 800);
		const view = card(650, 200, 600);
		scrollport.append(view.element);
		tracker.observe(view.element, event);
		expect(onObservation.mock.calls.at(-1)?.[0]).toMatchObject({ visibleArea: 0, availableArea: 120_000 });
		tracker.disconnect();
	});

	test('records width clipping and zero-size geometry without substituting a visible state', () => {
		const onObservation = vi.fn();
		const tracker = createHanamiImpressionTracker({ onObservation });
		const view = card(-50, 400, 100, 51);
		tracker.observe(view.element, event);
		expect(onObservation.mock.calls.at(-1)?.[0]).toMatchObject({ visibleArea: 4_900, availableArea: 10_000 });
		view.visible(0, 0);
		expect(onObservation.mock.calls.at(-1)?.[0]).toMatchObject({ visibleArea: 0, availableArea: 0 });
		tracker.disconnect();
	});

	test('stops a remotely completed entry across unobserve and observe', () => {
		const onObservation = vi.fn();
		const tracker = createHanamiImpressionTracker({ onObservation });
		const view = card();
		tracker.observe(view.element, event);
		tracker.complete([event.eventId]);
		const count = onObservation.mock.calls.length;
		tracker.unobserve(view.element);
		tracker.observe(view.element, { ...event, eventId: 'new-local-id' });
		vi.advanceTimersByTime(2_000);
		expect(onObservation).toHaveBeenCalledTimes(count);
		tracker.disconnect();
	});

	test('stops a resumed entry when a delayed completion ACK names its previous series', () => {
		const onObservation = vi.fn();
		const tracker = createHanamiImpressionTracker({ onObservation });
		const view = card();
		tracker.observe(view.element, event);
		vi.advanceTimersByTime(100);
		visibility = 'hidden';
		document.dispatchEvent(new Event('visibilitychange'));
		visibility = 'visible';
		document.dispatchEvent(new Event('visibilitychange'));
		expect(onObservation.mock.calls.at(-1)?.[0].eventId).not.toBe(event.eventId);
		tracker.complete([event.eventId]);
		const count = onObservation.mock.calls.length;
		vi.advanceTimersByTime(1_000);
		expect(onObservation).toHaveBeenCalledTimes(count);
		tracker.disconnect();
	});

	test.each(['unobserve', 'disconnect', 'pagehide'] as const)('emits one terminal observation on %s and stops checkpoints', action => {
		const onObservation = vi.fn();
		const tracker = createHanamiImpressionTracker({ onObservation });
		const view = card();
		tracker.observe(view.element, event);
		vi.advanceTimersByTime(123);
		if (action === 'unobserve') tracker.unobserve(view.element);
		else if (action === 'disconnect') tracker.disconnect();
		else window.dispatchEvent(new Event('pagehide'));
		expect(onObservation.mock.calls.at(-1)?.[0]).toMatchObject({ ...event, sequence: 1, elapsedMs: 123, ended: true });
		const count = onObservation.mock.calls.length;
		vi.advanceTimersByTime(2_000);
		expect(onObservation).toHaveBeenCalledTimes(count);
		tracker.disconnect();
	});

	test('stops on queue backpressure and resumes with a new series without a missing interval', () => {
		const onObservation = vi.fn().mockReturnValue(false);
		const tracker = createHanamiImpressionTracker({ onObservation });
		const view = card();
		tracker.observe(view.element, event);
		const count = onObservation.mock.calls.length;
		vi.advanceTimersByTime(5_000);
		expect(onObservation).toHaveBeenCalledTimes(count);
		onObservation.mockReturnValue(true);
		tracker.resume();
		const resumed = onObservation.mock.calls.at(-1)?.[0];
		expect(resumed).toMatchObject({ sequence: 0, elapsedMs: 0, ended: false });
		expect(resumed.eventId).not.toBe(event.eventId);
		tracker.disconnect();
	});
});
