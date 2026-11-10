import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createHanamiImpressionTracker as createTracker } from '@/utility/hanami-impressions.js';

type DisplayEvent = { eventId: string; snapshotId: string; entryId: string; noteId: string };
const event: DisplayEvent = { eventId: 'event1', snapshotId: 'snapshot1', entryId: 'entry1', noteId: 'note1' };
let visibility = 'visible';
let focused = true;
let viewportWidth = 100;
let viewportHeight = 100;
let observers: FakeObserver[] = [];

/** Happy-dom cannot create browser-trusted events. This boundary double supplies only the trust bit; actual DOM listeners and all observation state transitions remain real. */
function input(type: string, trusted = true) {
	const event = new Event(type, { bubbles: true });
	Object.defineProperty(event, 'isTrusted', { value: trusted });
	window.dispatchEvent(event);
}

function createHanamiImpressionTracker(options: Parameters<typeof createTracker>[0]) {
	const tracker = createTracker(options);
	input('pointerdown');
	return tracker;
}

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
	focused = true;
	vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);
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
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.replaceChildren(); });

/** Oracle: the page API contract gives this observer geometry, monotonic timestamps and lifecycle only. Every nonempty or empty visible state is observable; delivery acknowledges receipt only. Browser layout is supplied as fixed rectangles because happy-dom does not lay out CSS. */
describe('raw recommendation display observations', () => {
	/** Oracle: stable geometry without trusted input has four 250ms observation opportunities, then stops at its finite 1000ms budget. Receipt callbacks and timers cannot restart the unchanged geometry. */
	test('collects all four inactive checkpoints and stays stopped after receipt callbacks', () => {
		const onObservation = vi.fn();
		const tracker = createTracker({ onObservation });
		const view = card();
		try {
			tracker.observe(view.element, event);
			vi.advanceTimersByTime(1_000);
			expect(onObservation.mock.calls.map(([record]) => [record.elapsedMs, record.ended])).toEqual([
				[0, false], [250, false], [500, false], [750, false], [1_000, true],
			]);
			const count = onObservation.mock.calls.length;
			tracker.resume();
			vi.advanceTimersByTime(60_000);
			expect(onObservation).toHaveBeenCalledTimes(count);
		} finally { tracker.disconnect(); }
	});

	/** Oracle: the 60-second collection budget is measured from the last trusted input, with geometry checkpoints retained in the same series before expiry. */
	test('renews the input collection budget from the latest trusted input', () => {
		const onObservation = vi.fn();
		const tracker = createHanamiImpressionTracker({ onObservation });
		const view = card();
		try {
			tracker.observe(view.element, event);
			vi.advanceTimersByTime(45_000);
			input('keydown');
			vi.advanceTimersByTime(59_750);
			expect(onObservation.mock.calls.at(-1)?.[0]).toMatchObject({ eventId: event.eventId, elapsedMs: 104_750, ended: false });
			vi.advanceTimersByTime(250);
			expect(onObservation.mock.calls.at(-1)?.[0]).toMatchObject({ eventId: event.eventId, elapsedMs: 105_000, ended: true });
		} finally { tracker.disconnect(); }
	});

	/** Oracle: 端末文脈契約（2026-11-09）§1。viewportは各観測時にcaptureし、端末推定を保った幅の変更だけでは同一seriesを分割しない。 */
	test('records changing viewport context within the same display series', () => {
		vi.stubGlobal('navigator', { userAgent: 'iPhone Mobile', maxTouchPoints: 5 });
		vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(pointer: coarse)' }));
		viewportWidth = 390;
		const onObservation = vi.fn();
		const tracker = createHanamiImpressionTracker({ onObservation });
		const view = card();
		try {
			tracker.observe(view.element, event);
			viewportWidth = 844;
			window.dispatchEvent(new Event('resize'));
			vi.advanceTimersByTime(250);
			const records = onObservation.mock.calls.map(([record]) => record);
			expect(records[0]).toMatchObject({ eventId: event.eventId, sequence: 0, deviceContext: { deviceClass: 'mobile', viewportClass: 'compact', primaryPointer: 'coarse' } });
			expect(records.at(-1)).toMatchObject({ eventId: event.eventId, sequence: 1, deviceContext: { deviceClass: 'mobile', viewportClass: 'medium', primaryPointer: 'coarse' } });
			expect(records.every(record => record.eventId === event.eventId && record.ended === false)).toBe(true);
		} finally { tracker.disconnect(); }
	});

	/** Oracle: the public collection budget gives stable geometry at least four checkpoints (1000ms) after its last change, independently of focus. Resizing at 300ms resets that geometry budget. */
	test('keeps changed inactive geometry observable for at least four checkpoints', () => {
		focused = false;
		const onObservation = vi.fn();
		const tracker = createTracker({ onObservation });
		const view = card(101);
		try {
			tracker.observe(view.element, event);
			vi.advanceTimersByTime(300);
			view.move(50);
			window.dispatchEvent(new Event('resize'));
			vi.advanceTimersByTime(1_200);
			const records = onObservation.mock.calls.map(([record]) => record);
			const firstVisible = records.find(record => record.visibleArea === 5_000);
			expect(firstVisible).toBeDefined();
			const terminal = records.at(-1);
			expect(terminal).toMatchObject({ visibleArea: 5_000, availableArea: 10_000, documentVisible: true, focused: false, ended: true });
			expect(terminal.elapsedMs - firstVisible.elapsedMs).toBeGreaterThanOrEqual(1_000);
			expect(records.every(record => record.focused === false && record.activityAgeMs === Number.MAX_SAFE_INTEGER)).toBe(true);
		} finally { tracker.disconnect(); }
	});

	/** Oracle: the public collection budget restarts on changed geometry after expiry. With no trusted input it retains at least four checkpoints after that change; trusted input gives a 60-second budget. Unchanged geometry and receipt callbacks cannot restart an expired interval. */
	test.each([
		{ trigger: 'trusted wheel scroll', hasFocus: false, frameDelay: 16 },
		{ trigger: 'scroll', hasFocus: false, frameDelay: 0 },
		{ trigger: 'resize', hasFocus: true, frameDelay: 0 },
		{ trigger: 'resize', hasFocus: false, frameDelay: 0 },
	])('observes newly visible geometry after inactive expiry through $trigger with focus=$hasFocus', ({ trigger, hasFocus, frameDelay }) => {
		focused = hasFocus;
		const onObservation = vi.fn();
		const tracker = createTracker({ onObservation });
		const view = card(101);
		try {
			tracker.observe(view.element, event);
			vi.advanceTimersByTime(1_000);
			expect(onObservation.mock.calls.at(-1)?.[0]).toMatchObject({ visibleArea: 0, focused: hasFocus, ended: true });
			const initialCount = onObservation.mock.calls.length;
			if (trigger === 'trusted wheel scroll') input('wheel');
			vi.advanceTimersByTime(frameDelay);
			view.move(50);
			window.dispatchEvent(new Event(trigger === 'resize' ? 'resize' : 'scroll'));
			vi.advanceTimersByTime(trigger === 'trusted wheel scroll' ? 60_000 : 1_250);
			const resumed = onObservation.mock.calls.slice(initialCount).map(([record]) => record);
			expect(resumed).toContainEqual(expect.objectContaining({ sequence: 0, elapsedMs: 0, focused: hasFocus, documentVisible: true, ended: false }));
			const firstVisible = resumed.find(record => record.visibleArea === 5_000 && record.availableArea === 10_000);
			expect(firstVisible).toBeDefined();
			const terminal = resumed.at(-1);
			expect(terminal).toMatchObject({ visibleArea: 5_000, availableArea: 10_000, focused: hasFocus, documentVisible: true, ended: true });
			expect(terminal.elapsedMs - firstVisible.elapsedMs).toBeGreaterThanOrEqual(1_000);
			expect(resumed.every(record => record.eventId !== event.eventId && record.focused === hasFocus)).toBe(true);
			if (trigger !== 'trusted wheel scroll') expect(resumed.every(record => record.activityAgeMs === Number.MAX_SAFE_INTEGER)).toBe(true);
			const count = onObservation.mock.calls.length;
			tracker.resume();
			window.dispatchEvent(new Event('scroll'));
			window.dispatchEvent(new Event('resize'));
			vi.advanceTimersByTime(60_000);
			expect(onObservation).toHaveBeenCalledTimes(count);
		} finally { tracker.disconnect(); }
	});

	/** Oracle: the public collector observes visible geometry without focus or trusted input for at least four 250ms checkpoints. A browser window may have no focus at mount or foreground return; neither transition fabricates activity. */
	test.each(['mount', 'visibility return'] as const)('records visible geometry without focus or activity after %s', transition => {
		focused = false;
		visibility = transition === 'mount' ? 'visible' : 'hidden';
		const onObservation = vi.fn();
		const tracker = createTracker({ onObservation });
		const view = card(50);
		try {
			tracker.observe(view.element, event);
			if (transition === 'visibility return') {
				vi.advanceTimersByTime(1_000);
				expect(onObservation).not.toHaveBeenCalled();
				visibility = 'visible';
				document.dispatchEvent(new Event('visibilitychange'));
			}
			vi.advanceTimersByTime(1_000);
			const records = onObservation.mock.calls.map(([record]) => record);
			expect(records).toContainEqual(expect.objectContaining({ sequence: 0, elapsedMs: 0, visibleArea: 5_000, availableArea: 10_000, documentVisible: true, focused: false, ended: false }));
			expect(records).toContainEqual(expect.objectContaining({ elapsedMs: 1_000, visibleArea: 5_000, availableArea: 10_000, documentVisible: true, focused: false }));
			expect(records.every(record => record.activityAgeMs === Number.MAX_SAFE_INTEGER && record.focused === false)).toBe(true);
			const count = onObservation.mock.calls.length;
			tracker.resume();
			vi.advanceTimersByTime(60_000);
			expect(onObservation).toHaveBeenCalledTimes(count);
		} finally { tracker.disconnect(); }
	});

	/** Oracle: opening a tab in the background and activating it from browser chrome supplies no trusted input. The public collector still provides four checkpoints of foreground geometry with unknown activity preserved. */
	test('observes an inactive foreground interval after a background mount without inventing activity', () => {
		visibility = 'hidden';
		focused = false;
		const onObservation = vi.fn();
		const tracker = createTracker({ onObservation });
		const view = card();
		try {
			tracker.observe(view.element, event);
			vi.advanceTimersByTime(1_000);
			expect(onObservation).not.toHaveBeenCalled();
			visibility = 'visible';
			document.dispatchEvent(new Event('visibilitychange'));
			focused = true;
			window.dispatchEvent(new Event('focus'));
			vi.advanceTimersByTime(1_000);
			const records = onObservation.mock.calls.map(([record]) => record);
			expect(records).toContainEqual(expect.objectContaining({ sequence: 0, elapsedMs: 0, documentVisible: true, ended: false }));
			expect(records).toContainEqual(expect.objectContaining({ elapsedMs: 1_000, documentVisible: true, focused: true }));
			expect(records.every(record => record.activityAgeMs === Number.MAX_SAFE_INTEGER)).toBe(true);
		} finally { tracker.disconnect(); }
	});

	/** Oracle: contract v4 caps one observed interval at 7202 records, even when geometry changes faster than the 250ms checkpoint. ACKs and further input must not create automatic replacement intervals that evade this cap; leaving and observing the card again is a new interval. */
	test('ends a geometry-heavy series at its record limit without restarting it from ACKs or input', () => {
		const onObservation = vi.fn();
		const tracker = createHanamiImpressionTracker({ onObservation });
		const view = card();
		try {
			tracker.observe(view.element, event);
			for (let index = 1; index <= 7_210; index++) {
				view.move(index % 2);
				window.dispatchEvent(new Event('scroll'));
			}
			expect(onObservation.mock.calls.length).toBeGreaterThan(100);
			expect(onObservation.mock.calls.length).toBeLessThanOrEqual(7_202);
			expect(onObservation.mock.calls.at(-1)?.[0]).toMatchObject({ eventId: event.eventId, ended: true });
			const count = onObservation.mock.calls.length;
			tracker.resume();
			input('wheel');
			vi.advanceTimersByTime(1_000);
			expect(onObservation).toHaveBeenCalledTimes(count);
			tracker.unobserve(view.element);
			tracker.observe(view.element, event);
			expect(onObservation.mock.calls.at(-1)?.[0]).toMatchObject({ sequence: 0, elapsedMs: 0, ended: false });
			expect(onObservation.mock.calls.at(-1)?.[0].eventId).not.toBe(event.eventId);
		} finally { tracker.disconnect(); }
	});

	/** Oracle: the independent 30-minute series limit must terminate a continuously active card before the 7202-record limit is reached. Trusted input every 20 seconds keeps idle expiry out of this case; 250ms checkpoints produce only 7201 records by the deadline. */
	test('ends at thirty minutes despite continuous activity and does not reset its clock on input', () => {
		const onObservation = vi.fn();
		const tracker = createHanamiImpressionTracker({ onObservation });
		const view = card();
		try {
			tracker.observe(view.element, event);
			for (let interval = 0; interval < 90; interval++) {
				input('keydown');
				vi.advanceTimersByTime(20_000);
			}
			expect(onObservation.mock.calls.at(-1)?.[0]).toMatchObject({ eventId: event.eventId, elapsedMs: 1_800_000, ended: true });
			expect(onObservation.mock.calls.length).toBeLessThan(7_202);
			const count = onObservation.mock.calls.length;
			input('pointerdown');
			tracker.resume();
			vi.advanceTimersByTime(60_000);
			expect(onObservation).toHaveBeenCalledTimes(count);
		} finally { tracker.disconnect(); }
	});

	/** Oracle: the public contract uses Number.MAX_SAFE_INTEGER for unobserved activity and scroll, and only trusted pointer/key/wheel/touch input updates activity. Focus, a synthetic key, and programmatic scrolling do not establish human activity. */
	test('keeps mount, focus, synthetic input and programmatic scrolling inactive', () => {
		const onObservation = vi.fn();
		const tracker = createTracker({ onObservation });
		const view = card();
		tracker.observe(view.element, event);
		expect(onObservation.mock.calls[0]?.[0]).toMatchObject({ activityAgeMs: Number.MAX_SAFE_INTEGER, scrollIdleMs: Number.MAX_SAFE_INTEGER });
		window.dispatchEvent(new Event('focus'));
		input('keydown', false);
		window.dispatchEvent(new Event('scroll'));
		vi.advanceTimersByTime(500);
		expect(onObservation.mock.calls.every(([record]) => record.activityAgeMs === Number.MAX_SAFE_INTEGER)).toBe(true);
		input('wheel');
		vi.advanceTimersByTime(250);
		expect(onObservation.mock.calls.at(-1)?.[0]).toMatchObject({ kind: 'viewport', focused: true, activityAgeMs: 250 });
		tracker.disconnect();
	});

	/** Oracle: wall-clock operation time uses the offset at that operation (east positive), while activity and scroll intervals use monotonic elapsed time. Input at 0ms and scroll at 100ms imply ages 250/150 at 250ms, and 500/400 at 500ms. */
	test('records activity and scroll ages with operation time and east-positive timezone', () => {
		vi.setSystemTime(new Date('2026-11-08T00:00:00.000Z'));
		vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-345);
		const onObservation = vi.fn();
		const tracker = createHanamiImpressionTracker({ onObservation });
		const view = card();
		tracker.observe(view.element, event);
		vi.advanceTimersByTime(100);
		window.dispatchEvent(new Event('scroll'));
		vi.advanceTimersByTime(150);
		expect(onObservation.mock.calls.at(-1)?.[0]).toMatchObject({
			kind: 'viewport', noteId: 'note1', elapsedMs: 250, activityAgeMs: 250, scrollIdleMs: 150,
			occurredAtMs: Date.parse('2026-11-08T00:00:00.250Z'), utcOffsetMinutes: 345,
		});
		vi.advanceTimersByTime(250);
		expect(onObservation.mock.calls.at(-1)?.[0]).toMatchObject({ elapsedMs: 500, activityAgeMs: 500, scrollIdleMs: 400 });
		tracker.disconnect();
	});

	/** Oracle: focus loss closes the focused interval. Still-visible geometry receives a finite collection interval of at least four checkpoints; a subsequent input starts a distinct series without replaying the gap. */
	test('ends the focused interval on blur but still observes the visible unfocused geometry', () => {
		const onObservation = vi.fn();
		const tracker = createHanamiImpressionTracker({ onObservation });
		const view = card();
		try {
			tracker.observe(view.element, event);
			input('pointerdown');
			vi.advanceTimersByTime(200);
			focused = false;
			window.dispatchEvent(new Event('blur'));
			expect(onObservation.mock.calls.map(([record]) => record)).toContainEqual(expect.objectContaining({ eventId: event.eventId, elapsedMs: 200, focused: false, ended: true }));
			vi.advanceTimersByTime(60_000);
			const geometry = onObservation.mock.calls.map(([record]) => record).filter(record => record.eventId !== event.eventId);
			expect(geometry).toContainEqual(expect.objectContaining({ sequence: 0, elapsedMs: 0, visibleArea: 10_000, availableArea: 10_000, documentVisible: true, focused: false, ended: false }));
			expect(geometry.some(record => record.elapsedMs >= 1_000 && record.documentVisible && record.visibleArea === 10_000)).toBe(true);
			expect(geometry.every(record => record.focused === false)).toBe(true);
			expect(geometry.at(-1)).toMatchObject({ ended: true });
			const count = onObservation.mock.calls.length;
			vi.advanceTimersByTime(60_000);
			expect(onObservation).toHaveBeenCalledTimes(count);
			focused = true;
			window.dispatchEvent(new Event('focus'));
			input('pointerdown');
			const resumed = onObservation.mock.calls.at(-1)?.[0];
			expect(resumed).toMatchObject({ snapshotId: event.snapshotId, entryId: event.entryId, sequence: 0, elapsedMs: 0, focused: true, ended: false });
			expect(resumed.eventId).not.toBe(event.eventId);
			expect(resumed.eventId).not.toBe(geometry[0].eventId);
		} finally { tracker.disconnect(); }
	});

	/** Oracle: the public collection budget ends at 60 seconds after the last trusted input. Fresh input can start a new interval without including the idle gap. */
	test('stops an unattended visible card and excludes idle time when input resumes', () => {
		const onObservation = vi.fn();
		const tracker = createHanamiImpressionTracker({ onObservation });
		const view = card();
		tracker.observe(view.element, event);
		input('pointerdown');
		vi.advanceTimersByTime(59_750);
		expect(onObservation.mock.calls.at(-1)?.[0]).toMatchObject({ elapsedMs: 59_750, ended: false });
		vi.advanceTimersByTime(250);
		expect(onObservation.mock.calls.at(-1)?.[0]).toMatchObject({ ended: true });
		const count = onObservation.mock.calls.length;
		vi.advanceTimersByTime(60_000);
		expect(onObservation).toHaveBeenCalledTimes(count);
		input('pointerdown');
		const resumed = onObservation.mock.calls.at(-1)?.[0];
		expect(resumed).toMatchObject({ sequence: 0, elapsedMs: 0, ended: false });
		expect(resumed.eventId).not.toBe(event.eventId);
		tracker.disconnect();
	});

	test('emits geometry changes immediately and checkpoints unchanged geometry', () => {
		const onObservation = vi.fn();
		const tracker = createHanamiImpressionTracker({ onObservation });
		const view = card(51);
		tracker.observe(view.element, event);
		expect(onObservation).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ ...event, sequence: 0, elapsedMs: 0, visibleArea: 4_900, availableArea: 10_000, documentVisible: true, ended: false }));
		vi.advanceTimersByTime(250);
		expect(onObservation.mock.calls.at(-1)?.[0]).toMatchObject({ ...event, sequence: 1, elapsedMs: 250, visibleArea: 4_900, availableArea: 10_000, documentVisible: true, ended: false });
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

	/** Oracle: receipt callbacks allow delivery recovery and do not end an active series. Leaving and observing again creates a distinct local series. */
	test('continues observations after receipt notification and permits a later interval', () => {
		const onObservation = vi.fn();
		const tracker = createHanamiImpressionTracker({ onObservation });
		const view = card();
		tracker.observe(view.element, event);
		tracker.resume();
		tracker.unobserve(view.element);
		tracker.observe(view.element, { ...event, eventId: 'new-local-id' });
		vi.advanceTimersByTime(2_000);
		expect(onObservation.mock.calls.at(-1)?.[0]).toMatchObject({ eventId: 'new-local-id', elapsedMs: 2_000, ended: false });
		tracker.disconnect();
	});

	test('keeps a resumed interval when a delayed receipt notification arrives', () => {
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
		tracker.resume();
		vi.advanceTimersByTime(1_000);
		expect(onObservation.mock.calls.at(-1)?.[0]).toMatchObject({ ended: false });
		expect(onObservation.mock.calls.at(-1)?.[0].elapsedMs).toBeGreaterThan(0);
		expect(onObservation.mock.calls.at(-1)?.[0].eventId).not.toBe(event.eventId);
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

	/** Oracle: the public receipt and finite-collection contract retains visible cards registered while delivery is full. Receipt alone starts their observation at elapsedMs=0, with four inactive checkpoints and no fabricated trusted activity. */
	test('observes a visible card registered during queue backpressure when receipt frees delivery', () => {
		const onObservation = vi.fn().mockReturnValue(false);
		const tracker = createTracker({ onObservation });
		const blocked = card();
		const waiting = card(50);
		const waitingEvent = { ...event, eventId: 'waiting-event', entryId: 'waiting-entry', noteId: 'waiting-note' };
		try {
			tracker.observe(blocked.element, event);
			tracker.observe(waiting.element, waitingEvent);
			expect(onObservation).toHaveBeenCalledTimes(1);
			vi.advanceTimersByTime(5_000);
			expect(onObservation).toHaveBeenCalledTimes(1);
			onObservation.mockClear();
			onObservation.mockReturnValue(true);
			tracker.resume();
			const resumed = onObservation.mock.calls.map(([record]) => record);
			expect(resumed).toHaveLength(2);
			expect(resumed).toEqual(expect.arrayContaining([
				expect.objectContaining({ entryId: event.entryId, sequence: 0, elapsedMs: 0, ended: false }),
				expect.objectContaining({ entryId: waitingEvent.entryId, sequence: 0, elapsedMs: 0, visibleArea: 5_000, availableArea: 10_000, documentVisible: true, ended: false }),
			]));
			vi.advanceTimersByTime(1_000);
			const records = onObservation.mock.calls.map(([record]) => record).filter(record => record.entryId === waitingEvent.entryId);
			expect(records.map(record => [record.elapsedMs, record.ended])).toEqual([
				[0, false], [250, false], [500, false], [750, false], [1_000, true],
			]);
			expect(records.every(record => record.activityAgeMs === Number.MAX_SAFE_INTEGER && record.scrollIdleMs === Number.MAX_SAFE_INTEGER)).toBe(true);
		} finally { tracker.disconnect(); }
	});

	/** Oracle: if delivery fills again while receipt is restarting several cards, cards that have not restarted remain eligible for the next receipt. Each resumed series begins at zero without counting either queue wait. */
	test('retains cards not yet restarted when delivery fills again during receipt recovery', () => {
		const onObservation = vi.fn().mockReturnValue(true);
		const tracker = createTracker({ onObservation });
		const views = [card(), card(25), card(50)];
		const events = views.map((_, index) => ({ ...event, eventId: `queued-event-${index}`, entryId: `queued-entry-${index}`, noteId: `queued-note-${index}` }));
		try {
			views.forEach((view, index) => tracker.observe(view.element, events[index]));
			expect(onObservation).toHaveBeenCalledTimes(3);
			onObservation.mockReturnValue(false);
			vi.advanceTimersByTime(250);
			expect(onObservation).toHaveBeenCalledTimes(4);
			onObservation.mockClear();
			vi.advanceTimersByTime(5_000);
			expect(onObservation).not.toHaveBeenCalled();
			onObservation.mockReturnValueOnce(true);
			tracker.resume();
			expect(onObservation).toHaveBeenCalledTimes(2);
			onObservation.mockClear();
			vi.advanceTimersByTime(5_000);
			expect(onObservation).not.toHaveBeenCalled();
			onObservation.mockReturnValue(true);
			tracker.resume();
			const resumed = onObservation.mock.calls.map(([record]) => record);
			expect(resumed).toHaveLength(3);
			expect(resumed.map(record => record.entryId)).toEqual(expect.arrayContaining(events.map(item => item.entryId)));
			for (const record of resumed) {
				expect(record).toMatchObject({ sequence: 0, elapsedMs: 0, documentVisible: true, ended: false, activityAgeMs: Number.MAX_SAFE_INTEGER });
				expect(events.map(item => item.eventId)).not.toContain(record.eventId);
			}
			vi.advanceTimersByTime(250);
			expect(onObservation.mock.calls.slice(3).map(([record]) => record.elapsedMs)).toEqual([250, 250, 250]);
		} finally { tracker.disconnect(); }
	});

	/** Oracle: the public collection budget restarts expired geometry only when it changes. A geometry change while delivery is full remains observable after receipt without a second scroll; receipt cannot restart an unchanged expired card. */
	test.each([
		{ state: 'changed', changed: true },
		{ state: 'unchanged', changed: false },
	])('resumes only changed expired geometry after queue recovery: $state', ({ changed }) => {
		const onObservation = vi.fn().mockReturnValue(true);
		const tracker = createTracker({ onObservation });
		const expired = card();
		const blocked = card();
		const blockedEvent = { ...event, eventId: 'blocked-event', entryId: 'blocked-entry', noteId: 'blocked-note' };
		try {
			tracker.observe(expired.element, event);
			vi.advanceTimersByTime(1_000);
			expect(onObservation.mock.calls.at(-1)?.[0]).toMatchObject({ entryId: event.entryId, elapsedMs: 1_000, ended: true });
			onObservation.mockReturnValue(false);
			tracker.observe(blocked.element, blockedEvent);
			if (changed) expired.move(50);
			window.dispatchEvent(new Event('scroll'));
			onObservation.mockClear();
			vi.advanceTimersByTime(5_000);
			expect(onObservation).not.toHaveBeenCalled();
			onObservation.mockReturnValue(true);
			tracker.resume();
			const resumed = onObservation.mock.calls.map(([record]) => record).filter(record => record.entryId === event.entryId);
			expect(resumed).toHaveLength(changed ? 1 : 0);
			if (changed) {
				expect(resumed[0]).toMatchObject({ sequence: 0, elapsedMs: 0, visibleArea: 5_000, availableArea: 10_000, documentVisible: true, ended: false, activityAgeMs: Number.MAX_SAFE_INTEGER });
				expect(resumed[0].eventId).not.toBe(event.eventId);
			}
			expect(onObservation.mock.calls.map(([record]) => record)).toContainEqual(expect.objectContaining({ entryId: blockedEvent.entryId, sequence: 0, elapsedMs: 0, ended: false }));
			vi.advanceTimersByTime(1_000);
			const count = onObservation.mock.calls.length;
			tracker.resume();
			vi.advanceTimersByTime(60_000);
			expect(onObservation).toHaveBeenCalledTimes(count);
			expect(onObservation.mock.calls.filter(([record]) => record.entryId === event.entryId)).toHaveLength(changed ? 5 : 0);
		} finally { tracker.disconnect(); }
	});

	/** Oracle: queue recovery does not observe a waiting card while its document is hidden, after it is unregistered, or after the tracker is disconnected. */
	test.each(['hidden', 'unobserve', 'disconnect'] as const)('does not observe a waiting card after %s when receipt arrives', action => {
		const onObservation = vi.fn().mockReturnValue(false);
		const tracker = createTracker({ onObservation });
		const blocked = card();
		const waiting = card(50);
		const waitingEvent = { ...event, eventId: 'waiting-event', entryId: 'waiting-entry', noteId: 'waiting-note' };
		try {
			tracker.observe(blocked.element, event);
			tracker.observe(waiting.element, waitingEvent);
			if (action === 'hidden') {
				visibility = 'hidden';
				document.dispatchEvent(new Event('visibilitychange'));
			} else if (action === 'unobserve') tracker.unobserve(waiting.element);
			else tracker.disconnect();
			onObservation.mockClear();
			onObservation.mockReturnValue(true);
			tracker.resume();
			vi.advanceTimersByTime(1_000);
			expect(onObservation.mock.calls.filter(([record]) => record.entryId === waitingEvent.entryId)).toHaveLength(0);
		} finally { tracker.disconnect(); }
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
