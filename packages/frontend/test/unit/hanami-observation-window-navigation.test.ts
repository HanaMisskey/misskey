import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import type { HanamiDisplayEvent, HanamiObservation, HanamiViewportObservation } from '@/utility/hanami-impressions.js';

const { request, pageWindow, navigate, viewer } = vi.hoisted(() => ({
	request: vi.fn(), pageWindow: vi.fn(), navigate: vi.fn(), viewer: { id: 'alice' },
}));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: request }));
vi.mock('@/os.js', () => ({ pageWindow, contextMenu: vi.fn() }));
vi.mock('@/router.js', () => ({ useRouter: () => ({ pushByPath: navigate }) }));
vi.mock('@/i.js', () => ({ $i: viewer }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: {} } }));

import MkA from '@/components/global/MkA.vue';
import { createHanamiImpressionTracker } from '@/utility/hanami-impressions.js';
import { flushHanamiObservations, interruptHanamiObservation, observeHanamiViewport } from '@/utility/hanami-interactions.js';
import { hanamiContextForNote, hanamiNavigationPath, withHanamiRecommendation } from '@/utility/hanami-recommendation-context.js';

const baseTime = Date.parse('2026-11-10T00:00:00.000Z');
const trackers: ReturnType<typeof createHanamiImpressionTracker>[] = [];
let example = 0;

function source(entryId: string): HanamiDisplayEvent {
	const event = { eventId: `navigation-${example}-${entryId}`, snapshotId: `snapshot-${example}`, entryId, noteId: `note-${entryId}` };
	return withHanamiRecommendation({ id: event.noteId, userId: 'bob', user: { id: 'bob' } }, event).recommendationEvent;
}

/** Happy-dom has no layout or intersection notifications. Fixed rectangles and real scroll events supply only browser geometry; tracker lifecycle, context lookup, registry, MkA and delivery stay real. */
function card(initialTop: number) {
	let top = initialTop;
	const element = document.createElement('article');
	vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, top, 100, 100));
	document.body.append(element);
	return { element, move(nextTop: number) { top = nextTop; } };
}

function collection() {
	const raw: HanamiViewportObservation[] = [];
	const tracker = createHanamiImpressionTracker({ onObservation(record) {
		raw.push(record);
		return observeHanamiViewport(record, record.entryId === 'target' ? 1 : 2);
	} });
	trackers.push(tracker);
	return { tracker, raw };
}

function records(): HanamiObservation[] {
	return request.mock.calls.filter(([route]) => route === 'hanami-impressions').flatMap(([, body]) => body.observations);
}

function closes(entryId: string) {
	return records().filter(record => record.kind === 'window' && record.phase === 'close' && record.entryId === entryId);
}

function anchor(event: HanamiDisplayEvent, behavior?: 'window') {
	const path = hanamiNavigationPath(`/notes/${event.noteId}`, event);
	const view = render(MkA, { props: { to: path, behavior }, slots: { default: '推薦ノート' } });
	return { link: view.getByText('推薦ノート'), path };
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
	vi.setSystemTime(baseTime);
	viewer.id = `viewer-${++example}`;
	request.mockReset();
	pageWindow.mockClear();
	navigate.mockClear();
	request.mockImplementation(async (route: string) => {
		if (route !== 'hanami-impressions') throw new Error(`Unexpected API: ${route}`);
		return undefined;
	});
	vi.spyOn(document, 'hasFocus').mockReturnValue(true);
	Object.defineProperty(document, 'hidden', { configurable: true, value: false });
	Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
	Object.defineProperty(window, 'innerWidth', { configurable: true, value: 100 });
	Object.defineProperty(window, 'innerHeight', { configurable: true, value: 100 });
	vi.stubGlobal('IntersectionObserver', class {
		observe() {}
		unobserve() {}
		disconnect() {}
	});
});

afterEach(async () => {
	for (const tracker of trackers.splice(0)) tracker.disconnect();
	interruptHanamiObservation();
	await flushHanamiObservations();
	cleanup();
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	document.body.replaceChildren();
});

/** Oracle: contract §6 and addendum §1 bind the window to an account/snapshot/entry, not a display-series ID. A background new tab interrupts only its source entry even if the tracker renewed its series after one second offscreen. No blur or hidden event is emitted: those would conceal a missed navigation. */
describe('recommendation navigation across display-series restarts', () => {
	test.each([
		{ method: 'ctrl', restart: false }, { method: 'ctrl', restart: true },
		{ method: 'meta', restart: false }, { method: 'meta', restart: true },
		{ method: 'middle', restart: false }, { method: 'middle', restart: true },
		{ method: 'blank', restart: false }, { method: 'blank', restart: true },
	])('interrupts only the target for $method navigation with restarted series=$restart', async ({ method, restart }) => {
		const target = source('target');
		const sibling = source('sibling');
		const view = card(restart ? 101 : 0);
		const otherView = card(0);
		const { tracker, raw } = collection();
		tracker.observe(view.element, target);
		if (restart) {
			await vi.advanceTimersByTimeAsync(1_000);
			expect(raw.at(-1)).toMatchObject({ eventId: target.eventId, visibleArea: 0, ended: true });
			expect(records().filter(record => record.kind === 'window')).toEqual([]);
			view.move(0);
			window.dispatchEvent(new Event('scroll'));
		}
		const firstVisible = raw.find(record => record.entryId === target.entryId && record.visibleArea > 0);
		expect(firstVisible).toMatchObject({ sequence: 0, elapsedMs: 0, documentVisible: true, ended: false });
		if (restart) expect(firstVisible?.eventId).not.toBe(target.eventId);
		else expect(firstVisible?.eventId).toBe(target.eventId);
		expect(hanamiContextForNote(target.eventId, target.noteId)).toEqual(target);
		tracker.observe(otherView.element, sibling);

		const { link, path } = anchor(target);
		expect(new URL((link as HTMLAnchorElement).href).searchParams.get('hanami')).toBe(target.eventId);
		let clicked = link;
		if (method === 'blank') {
			// MkA owns SPA clicks. A native target=_blank anchor exercises the separate browser-default navigation boundary.
			const nativeLink = document.createElement('a');
			nativeLink.href = path;
			nativeLink.target = '_blank';
			document.body.append(nativeLink);
			clicked = nativeLink;
		}
		clicked.addEventListener(method === 'middle' ? 'auxclick' : 'click', event => event.preventDefault());
		clicked.dispatchEvent(new MouseEvent(method === 'middle' ? 'auxclick' : 'click', {
			bubbles: true, cancelable: true, ctrlKey: method === 'ctrl', metaKey: method === 'meta', button: method === 'middle' ? 1 : 0,
		}));
		expect(navigate).not.toHaveBeenCalled();
		expect(pageWindow).not.toHaveBeenCalled();
		expect(document.hidden).toBe(false);
		expect(document.hasFocus()).toBe(true);
		await vi.advanceTimersByTimeAsync(60_000);
		await flushHanamiObservations();
		expect.soft(closes(target.entryId)).toEqual([expect.objectContaining({ complete: false, endReason: 'interrupted' })]);
		expect.soft(closes(sibling.entryId)).toEqual([expect.objectContaining({ complete: true, pendingActions: 0, endReason: 'completed' })]);
	});
});

/** Oracle: contract §6 excludes same-document SPA navigation; window-api §2 explicitly preserves os.pageWindow. Same-document semantics take precedence over treating every Shift click as a new document. The actual MkA caller selects pageWindow for Shift and behavior=window. */
describe('MkA and native-link document boundaries', () => {
	test.each(['spa', 'shift', 'window'] as const)('preserves the complete interval for %s', async method => {
		const target = source('target');
		const { tracker } = collection();
		tracker.observe(card(0).element, target);
		const { link, path } = anchor(target, method === 'window' ? 'window' : undefined);
		const event = new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: method === 'shift' });
		link.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
		if (method === 'spa') {
			expect(navigate).toHaveBeenCalledWith(path, null);
			expect(pageWindow).not.toHaveBeenCalled();
		} else {
			expect(pageWindow).toHaveBeenCalledWith(path);
			expect(navigate).not.toHaveBeenCalled();
		}
		await vi.advanceTimersByTimeAsync(60_000);
		await flushHanamiObservations();
		expect(closes(target.entryId)).toEqual([expect.objectContaining({ complete: true, pendingActions: 0, endReason: 'completed' })]);
	});

	/** Oracle: a native anchor has no MkA handler selecting os.pageWindow; its Shift-click browser default opens a separate document. Preserving MkA Shift navigation must not disable that interruption. */
	test('interrupts native Shift navigation that leaves the document', async () => {
		const target = source('target');
		const { tracker } = collection();
		tracker.observe(card(0).element, target);
		const link = document.createElement('a');
		link.href = hanamiNavigationPath(`/notes/${target.noteId}`, target);
		document.body.append(link);
		link.addEventListener('click', event => event.preventDefault());
		link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true }));
		await vi.advanceTimersByTimeAsync(60_000);
		await flushHanamiObservations();
		expect(closes(target.entryId)).toEqual([expect.objectContaining({ complete: false, endReason: 'interrupted' })]);
	});
});
