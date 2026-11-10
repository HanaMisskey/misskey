/// <reference types="vite/client" />
/* eslint-disable vue/one-component-per-file -- Leaf component doubles isolate the actual recommendation screen and preserve its controls and slots. */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { defineComponent, h, nextTick, ref } from 'vue';
import { AppearObserver } from '../helpers/appear-observer.js';
import type { Component, InjectionKey, PropType } from 'vue';
import type { MenuItem } from '@/types/menu.js';
import { appearDirective } from '@/directives/appear.js';
import MkHanamiRecommendations from '@/components/MkHanamiRecommendations.vue';
import MkError from '@/components/global/MkError.vue';
import MkResult from '@/components/global/MkResult.vue';
import { flushHanamiObservations } from '@/utility/hanami-interactions.js';

type DisplayEvent = { eventId: string; snapshotId: string; entryId: string; noteId: string };
type Observation = DisplayEvent & { kind: 'viewport'; occurredAtMs: number; utcOffsetMinutes: number; focused: boolean; activityAgeMs: number; scrollIdleMs: number; sequence: number; elapsedMs: number; visibleArea: number; availableArea: number; documentVisible: boolean; ended: boolean };
// These transport fixtures remain offscreen; positive viewport/window behavior has separate caller tests below.
const measurement = (event: DisplayEvent, sequence = 0): Observation => ({ ...event, kind: 'viewport', occurredAtMs: Date.now(), utcOffsetMinutes: 345, focused: true, activityAgeMs: 0, scrollIdleMs: 500, sequence, elapsedMs: sequence * 250, visibleArea: 0, availableArea: 100, documentVisible: true, ended: false });
type WithFiles = boolean;
const { request, popupMenu, contextMenu, captures, observed, trackerCallbacks, trackerResume, trackerMode } = vi.hoisted(() => ({
	request: vi.fn(), popupMenu: vi.fn(), contextMenu: vi.fn(), captures: [] as { httpOnly: boolean; mock: boolean }[],
	observed: [] as { element: Element; event: DisplayEvent }[], trackerCallbacks: [] as ((event: Observation) => boolean | void)[], trackerResume: vi.fn(),
	trackerMode: { real: false, active: true },
}));
vi.mock('@/preferences.js', async () => {
	const { reactive, ref, toRef } = await import('vue');
	const s = reactive({ enableInfiniteScroll: false, enablePullToRefresh: false, animation: false });
	const showFixedPostForm = ref(false);
	return { prefer: { s, r: { enableInfiniteScroll: toRef(s, 'enableInfiniteScroll'), pinnedUserLists: ref([]), showFixedPostForm }, model: () => showFixedPostForm } };
});
import { prefer } from '@/preferences.js';
const preferences = prefer.s;
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: request }));
vi.mock('@/utility/hanami-device-context.js', () => ({ captureHanamiDeviceContext: () => ({ deviceClass: 'desktop', viewportClass: 'wide', primaryPointer: 'fine' }) }));
vi.mock('@/i.js', () => ({ $i: { id: 'alice', policies: { hanamiTlAvailable: true } } }));
vi.mock('@/instance.js', () => ({ instance: { hanamiRecommendationsEnabled: true } }));
vi.mock('@/os.js', () => ({ popupMenu, contextMenu, alert: vi.fn(), success: vi.fn() }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/cache.js', () => ({ antennasCache: {}, userListsCache: {}, favoritedChannelsCache: {} }));
vi.mock('@/utility/device-kind.js', () => ({ deviceKind: 'desktop' }));
vi.mock('@/local-storage.js', () => ({ miLocalStorage: { getItemAsJson: vi.fn() } }));
vi.mock('@/store.js', async () => {
	const { ref } = await import('vue');
	const s = { tl: { src: 'hanami', filter: {} }, hanamiRecommendationWithFiles: false };
	return { store: { s, r: { tl: ref(s.tl), hanamiRecommendationWithFiles: ref(false), hanamiRecommendationImageFilter: ref('any') } } };
});
vi.mock('@/components/MkStreamingNotesTimeline.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkPostForm.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkPaginationControl.vue', () => ({ default: { template: '<p>ページ送りの追加設定</p>' } }));
vi.mock('@/i18n.js', async () => {
	const { default: rawLocale } = await import('../../../../locales/ja-JP.yml?raw');
	const { load } = await import('js-yaml');
	const ts = load(rawLocale) as Record<string, unknown>;
	const formatter = (value: unknown): unknown => typeof value === 'string'
		? (params: Record<string, unknown>) => value.replace(/\{([^}]+)\}/g, (_, name: string) => String(params[name]))
		: Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, formatter(item)]));
	return { i18n: { ts, tsx: formatter(ts) } };
});
vi.mock('@/utility/hanami-impressions.js', async importOriginal => {
	const actual = await importOriginal<typeof import('@/utility/hanami-impressions.js')>();
	return { ...actual, createHanamiImpressionTracker: (options: { onObservation: (event: Observation) => boolean | void }) => {
		if (trackerMode.real) {
			const tracker = actual.createHanamiImpressionTracker(options);
			if (trackerMode.active) {
				const input = new Event('pointerdown');
				Object.defineProperty(input, 'isTrusted', { value: true });
				window.dispatchEvent(input);
			}
			return tracker;
		}
		trackerCallbacks.push(options.onObservation);
		return { observe: (element: Element, event: DisplayEvent) => observed.push({ element, event }), unobserve: vi.fn(), disconnect: vi.fn(), resume: trackerResume };
	} };
});
vi.mock('@/components/MkNote.vue', async () => {
	const { defineComponent, h, inject } = await import('vue');
	const { DI } = await import('@/di.js');
	return { default: defineComponent({ props: { note: { type: Object as PropType<{ id: string; text?: string }>, required: true }, additionalMenuItems: { type: Function as PropType<() => MenuItem[]>, default: undefined } }, setup(props) {
		captures.push({ httpOnly: inject((DI as typeof DI & { noteCaptureHttpOnly: InjectionKey<boolean> }).noteCaptureHttpOnly, false), mock: inject(DI.mock, false) });
		return () => h('article', { 'data-note-id': props.note.id }, [props.note.text ?? props.note.id, h('button', { onClick: () => popupMenu(props.additionalMenuItems?.() ?? []) }, 'ノートのメニュー')]);
	} }) };
});

function page(ids: string[], nextCursor: string | null = null, snapshotId = 'snapshot1') {
	return {
		items: ids.map(id => ({ entryId: `entry-${id}`, note: { id, text: `本文 ${id}`, createdAt: '2026-11-01T12:00:00.000Z', cw: null, userId: 'bob', user: { id: 'bob', username: 'bob' }, tags: ['猫'], fileIds: [], files: [] } })),
		nextCursor, snapshotId, revision: 0,
	};
}

async function acknowledgeObservations(route: string) {
	if (route !== 'hanami-impressions') throw new Error(`Unexpected route ${route}`);
	return undefined;
}

/** Oracle: window-api §1/2 keeps delivery alive after unmount; the 2026-11-10 public contract resolves successful observation batches with no value. Each sent record must receive a successful response, including an identical retry after failure; pending promises and undelivered records cannot be hidden by clearing timers or the mock. */
async function finishObservationDelivery() {
	await flushHanamiObservations();
	await flushHanamiObservations();
	const unacknowledged = new Set<string>();
	for (const [index, [route, body]] of request.mock.calls.entries()) {
		if (route !== 'hanami-impressions') continue;
		const records = body.observations.map((record: unknown) => JSON.stringify(record));
		for (const record of records) unacknowledged.add(record);
		const result = request.mock.results[index];
		const [settled] = await Promise.allSettled([result.type === 'return' ? result.value : Promise.reject(result.value)]);
		if (settled.status === 'rejected') continue;
		expect(settled.value).toBeUndefined();
		for (const record of records) unacknowledged.delete(record);
	}
	expect([...unacknowledged]).toEqual([]);
}

function mount(initialWithFiles: WithFiles = false, timeline?: Component) {
	const withFiles = ref(initialWithFiles);
	const screen = ref<{ refresh: () => Promise<void> }>();
	const host = defineComponent({ setup() { return () => h(MkHanamiRecommendations, { ref: screen, withFiles: withFiles.value }); } });
	const passthrough = defineComponent({ setup(_props, { slots }) { return () => h('div', slots.default?.()); } });
	const button = defineComponent({ props: { disabled: Boolean }, setup(props, { slots }) {
		return () => h('button', { disabled: props.disabled }, slots.default?.());
	} });
	const select = defineComponent({ props: { modelValue: { type: String, default: '' } }, emits: ['update:modelValue'], setup(props, { emit, slots }) {
		return () => h('label', [slots.label?.(), h('select', { value: props.modelValue, onChange: (event: Event) => emit('update:modelValue', (event.target as HTMLSelectElement).value) }, slots.default?.())]);
	} });
	const pull = defineComponent({ props: { refresher: { type: Function, required: true } }, setup(props, { slots }) {
		return () => h('section', { 'data-testid': 'pull-region' }, [h('button', { onClick: () => props.refresher() }, 'pull refresh'), slots.default?.()]);
	} });
	const view = render(timeline ?? host, { global: { components: { MkError, MkResult }, directives: { appear: appearDirective }, stubs: {
		MkButton: button, MkSelect: select, MkLoading: { render: () => h('p', '確認中') }, MkSystemIcon: true,
		MkInfo: passthrough, PageWithHeader: passthrough, MkAd: { template: '<p>広告</p>' },
		MkPullToRefresh: pull,
	} } });
	return { ...view, setWithFiles: (value: WithFiles) => { withFiles.value = value; }, refresh: () => screen.value?.refresh() };
}

async function menuButtons(items: MenuItem[]): Promise<{ text: string; action: (event: MouseEvent) => void }[]> {
	const buttons: { text: string; action: (event: MouseEvent) => void }[] = [];
	for (const pending of items) {
		const item = await pending;
		if ('children' in item) buttons.push(...await menuButtons(await (typeof item.children === 'function' ? item.children() : item.children)));
		if ('action' in item && 'text' in item) buttons.push({ text: typeof item.text === 'string' ? item.text : item.text.value, action: item.action });
	}
	return buttons;
}

beforeEach(() => {
	trackerMode.real = false;
	trackerMode.active = true;
	vi.spyOn(document, 'hasFocus').mockReturnValue(true);
	vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-345);
	preferences.enableInfiniteScroll = false;
	preferences.enablePullToRefresh = false;
	AppearObserver.reset();
	vi.stubGlobal('IntersectionObserver', AppearObserver);
	Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
	Object.defineProperty(document, 'hidden', { configurable: true, value: false });
});
afterEach(async () => {
	cleanup();
	window.dispatchEvent(new Event('pagehide'));
	await finishObservationDelivery();
	vi.clearAllTimers();
	vi.useRealTimers();
	request.mockReset(); popupMenu.mockReset(); contextMenu.mockReset(); captures.length = 0; observed.length = 0; trackerCallbacks.length = 0; trackerResume.mockReset(); vi.unstubAllGlobals(); vi.restoreAllMocks();
}, 2_000);

/** Oracle: docs/hanami-recommendations-page-contract.md retains the HTTP cursor list and explicit feedback. The real screen and shared renderers exercise page state and feedback; the note leaf exercises its explicit menu props. Real MkNote/menu integration is covered in hanami-note-menu.test.ts, and header access in hanami-timeline-header.test.ts. The separately tested exposure tracker is driven explicitly here. Manual cases accept both former/current continuation labels to isolate unchanged state behavior; the pagination cases below require the ordinary loadMore label. */
describe('recommendation HTTP screen', () => {
	/** Oracle: the shared pagination contract offers MkError's explicit retry after an initial failure, without a cursor or an automatic retry loop. */
	test('offers the ordinary error retry when the first page fails', async () => {
		request.mockRejectedValueOnce({ code: 'UNAVAILABLE' }).mockResolvedValueOnce(page(['recovered']));
		const view = mount();
		await view.findByRole('button', { name: '再試行' });
		expect(view.getByText('問題が発生しました')).toBeTruthy();
		expect(request).toHaveBeenCalledTimes(1);
		await fireEvent.click(view.getByRole('button', { name: '再試行' }));
		await view.findByText('本文 recovered');
		expect(request.mock.calls[1]).toEqual(['notes/hanami-recommendations', expect.objectContaining({ limit: 20, withFiles: false })]);
		expect(request.mock.calls[1][1].cursor).toBeUndefined();
		expect(view.queryByRole('button', { name: '再試行' })).toBeNull();
	});

	/** Oracle: no final results use the ordinary timeline's noNotes empty state, without recommendation-only explanatory text or pagination settings. */
	test('shows the ordinary no-notes result for an empty final page', async () => {
		request.mockResolvedValueOnce(page([]));
		const view = mount();
		await view.findByText('ノートはありません');
		expect(view.queryByRole('button', { name: 'もっと見る' })).toBeNull();
		expect(view.queryByText('ページ送りの追加設定')).toBeNull();
	});

	/** Oracle: the timeline delegates one pull gesture to the common list; a single gesture starts one new snapshot and clears the previous cards while waiting. This double exposes the gesture callback, not browser touch physics. */
	test('refreshes from one pull region in the complete timeline', async () => {
		preferences.enablePullToRefresh = true;
		let finish: ((value: ReturnType<typeof page>) => void) | undefined;
		request.mockResolvedValueOnce(page(['old'], 'old-cursor'))
			.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
		const { default: Timeline } = await import('@/pages/timeline.vue');
		const view = mount(false, Timeline);
		await view.findByText('本文 old');
		expect(view.getAllByRole('button', { name: 'pull refresh' })).toHaveLength(1);
		await fireEvent.click(view.getByRole('button', { name: 'pull refresh' }));
		expect(request).toHaveBeenCalledTimes(2);
		expect(request.mock.calls[1][1].cursor).toBeUndefined();
		expect(view.queryByText('本文 old')).toBeNull();
		expect(view.getByText('確認中')).toBeTruthy();
		if (!finish) throw new Error('Pull refresh did not start');
		finish(page(['fresh'], null, 'snapshot2'));
		await view.findByText('本文 fresh');
		expect(view.getAllByRole('button', { name: 'pull refresh' })).toHaveLength(1);
	});

	/** Oracle: the ordinary pagination context menu reloads from list whitespace even when pull-to-refresh is disabled, and never reuses the continuation cursor. */
	test('reloads from the list whitespace context menu', async () => {
		request.mockResolvedValueOnce(page(['old'], 'old-cursor')).mockResolvedValueOnce(page(['fresh'], null, 'snapshot2'));
		const view = mount(true);
		await view.findByText('本文 old');
		const more = view.getByRole('button', { name: 'もっと見る' });
		if (!more.parentElement) throw new Error('List whitespace is missing');
		await fireEvent.contextMenu(more.parentElement);
		expect(contextMenu).toHaveBeenCalledTimes(1);
		const reload = (await menuButtons(contextMenu.mock.calls[0][0])).find(item => item.text === 'リロード');
		if (!reload) throw new Error('The list context menu has no reload action');
		await reload.action(new MouseEvent('click'));
		await view.findByText('本文 fresh');
		expect(request.mock.calls[1][1]).toMatchObject({ limit: 20, withFiles: true });
		expect(request.mock.calls[1][1].cursor).toBeUndefined();
		expect(view.queryByText('本文 old')).toBeNull();
	});

	test('renders the public page response in received order with adjustable HTTP-only non-mock cards', async () => {
		const ranked = page(['z', 'a', 'm', 'b']);
		ranked.items[0].note.createdAt = '2026-10-29T12:00:00.000Z';
		ranked.items[2].note.createdAt = '2026-10-30T12:00:00.000Z';
		request.mockResolvedValue(ranked);
		const view = mount();
		await view.findByText('本文 z');
		expect([...view.container.querySelectorAll('[data-note-id]')].map(element => element.getAttribute('data-note-id'))).toEqual(['z', 'a', 'm', 'b']);
		expect(view.queryByText('10/29')).toBeNull();
		expect(view.queryByText('11/1')).toBeNull();
		expect(view.queryByText('10/30')).toBeNull();
		expect(view.queryByText('ページ送りの追加設定')).toBeNull();
		expect(view.queryByText('広告')).toBeNull();
		expect(view.getAllByRole('button', { name: 'ノートのメニュー' })).toHaveLength(4);
		expect(captures).toEqual([{ httpOnly: true, mock: false }, { httpOnly: true, mock: false }, { httpOnly: true, mock: false }, { httpOnly: true, mock: false }]);
		expect(request).toHaveBeenCalledWith('notes/hanami-recommendations', { limit: 20, withFiles: false, refresh: false, utcOffsetMinutes: 345, deviceContext: { deviceClass: 'desktop', viewportClass: 'wide', primaryPointer: 'fine' }, clientCapabilities: { nativeShare: false } });
		expect(request.mock.calls.some(([route]) => route === 'hanami-impressions')).toBe(false);
	});

	/** Oracle: the four UI comments remove the description and body controls, place adjustment inside the note menu, and remove individually rounded card panels. This DOM assertion cannot certify rendered spacing or fractional-pixel borders. */
	test('has no description, body filter, refresh control or independent adjustment footer', async () => {
		request.mockResolvedValue(page(['a', 'z']));
		const view = mount();
		await view.findByText('本文 a');
		expect.soft(view.queryByText('公開投稿をおすすめします。')).toBeNull();
		expect.soft(view.queryByRole('combobox')).toBeNull();
		expect.soft(view.queryByRole('button', { name: 'おすすめを更新' })).toBeNull();
		expect.soft(view.queryByRole('button', { name: 'おすすめの調整' })).toBeNull();
		const notes = view.container.querySelectorAll('[data-note-id]');
		for (const note of notes) {
			const panel = note.closest('._panel');
			if (panel) expect.soft(panel.querySelectorAll('[data-note-id]')).toHaveLength(2);
			expect.soft(note.parentElement?.querySelectorAll(':scope > button')).toHaveLength(0);
		}
	});

	test('discards an old continuation when the parent changes the file condition', async () => {
		let finishOld: ((value: ReturnType<typeof page>) => void) | undefined;
		request.mockResolvedValueOnce(page(['old'], 'old-position'))
			.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
			.mockResolvedValueOnce(page(['image'], null, 'snapshot-image'));
		const view = mount();
		await view.findByText('本文 old');
		await fireEvent.click(view.getByRole('button', { name: /もっと見る|さらに表示/ }));
		view.setWithFiles(true);
		await view.findByText('本文 image');
		expect(request.mock.calls[2][1]).toMatchObject({ withFiles: true });
		expect(request.mock.calls[2][1].cursor).toBeUndefined();
		if (!finishOld) throw new Error('Continuation request did not start');
		finishOld(page(['stale']));
		await nextTick();
		expect(view.queryByText('本文 stale')).toBeNull();
		expect(view.queryByText('本文 old')).toBeNull();
	});

	test('reopens the submenu and retries failed feedback with the same event ID', async () => {
		request.mockResolvedValueOnce(page(['a'], 'position1'))
			.mockRejectedValueOnce({ code: 'UNAVAILABLE' })
			.mockResolvedValueOnce({ revision: 1, refreshRequired: true });
		const view = mount();
		await view.findByText('本文 a');
		for (let attempt = 0; attempt < 2; attempt++) {
			await fireEvent.click(view.getByRole('button', { name: 'ノートのメニュー' }));
			const menu = await Promise.all(popupMenu.mock.calls[attempt][0] as MenuItem[]);
			expect(menu).toContainEqual(expect.objectContaining({ type: 'parent', text: 'おすすめの調整' }));
			const less = (await menuButtons(menu)).find(item => item.text === 'この作者を減らす');
			if (!less) throw new Error('Missing author less action');
			await less.action(new MouseEvent('click'));
			if (attempt === 0) expect(view.getByRole('alert').textContent).toContain('調整');
		}
		expect(request.mock.calls[2]).toEqual(request.mock.calls[1]);
		expect(request.mock.calls[1][1]).toMatchObject({ eventId: expect.any(String), snapshotId: 'snapshot1', entryId: 'entry-a' });
		expect(view.queryByRole('alert')).toBeNull();
		expect(view.queryByRole('button', { name: /もっと見る|さらに表示/ })).toBeNull();
	});

	/** Oracle: changing only the file condition must preserve a failed feedback's retry ID. A cursorless fetch may return the same snapshot; choosing the same entry/action again then retries the original operation. */
	test('retains a failed feedback ID when a file toggle returns to the same snapshot entry', async () => {
		const writes: unknown[] = [];
		request.mockImplementation(async (route: string, body: { withFiles?: boolean }) => {
			if (route === 'notes/hanami-recommendations') return body.withFiles ? page(['audio'], null, 'snapshot2') : page(['a']);
			if (route === 'hanami-feedback') {
				writes.push(structuredClone(body));
				if (writes.length === 1) throw new Error('synthetic network failure');
				return { revision: 1, refreshRequired: true };
			}
			throw new Error(`Unexpected route ${route}`);
		});
		const view = mount();
		await view.findByText('本文 a');
		const chooseLess = async () => {
			await fireEvent.click(view.getByRole('button', { name: 'ノートのメニュー' }));
			const less = (await menuButtons(popupMenu.mock.calls.at(-1)![0])).find(item => item.text === 'この作者を減らす');
			if (!less) throw new Error('Missing author less action');
			await less.action(new MouseEvent('click'));
		};
		await chooseLess();
		view.setWithFiles(true);
		await view.findByText('本文 audio');
		view.setWithFiles(false);
		await view.findByText('本文 a');
		await chooseLess();
		expect(writes).toHaveLength(2);
		expect(writes[1]).toEqual(writes[0]);
	});

	test('continues an empty intermediate page using its cursor', async () => {
		request.mockResolvedValueOnce(page([], 'position1')).mockResolvedValueOnce(page(['a']));
		const view = mount();
		await fireEvent.click(await view.findByRole('button', { name: /もっと見る|さらに表示/ }));
		await view.findByText('本文 a');
		expect(request.mock.calls[1]).toEqual(['notes/hanami-recommendations', expect.objectContaining({ cursor: 'position1' })]);
	});

	test.each([true, false])('changes the file switch to %s through a new snapshot', async withFiles => {
		request.mockResolvedValueOnce(page(['a'], 'old-position')).mockResolvedValueOnce(page(['image'], null, 'snapshot2'));
		const view = mount(!withFiles);
		await view.findByText('本文 a');
		view.setWithFiles(withFiles);
		await view.findByText('本文 image');
		expect(request.mock.calls[1][1]).toMatchObject({ withFiles });
		expect(request.mock.calls[1][1].cursor).toBeUndefined();
		expect(view.queryByText('本文 a')).toBeNull();
	});

	test('keeps earlier results after a continuation failure and retries the same position', async () => {
		request.mockResolvedValueOnce(page(['a'], 'position1')).mockRejectedValueOnce({ code: 'UNAVAILABLE' }).mockResolvedValueOnce(page(['z']));
		const view = mount();
		await view.findByText('本文 a');
		await fireEvent.click(view.getByRole('button', { name: /もっと見る|さらに表示/ }));
		await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
		expect(view.getByText('本文 a')).toBeTruthy();
		await fireEvent.click(await view.findByRole('button', { name: '再試行' }));
		await view.findByText('本文 z');
		expect(request.mock.calls[2][1].cursor).toBe('position1');
	});

	test('discards an old in-flight continuation after refresh changes the snapshot', async () => {
		let finishOld: ((value: ReturnType<typeof page>) => void) | undefined;
		request.mockResolvedValueOnce(page(['a'], 'position1'))
			.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
			.mockResolvedValueOnce(page(['new'], null, 'snapshot2'));
		const view = mount();
		await view.findByText('本文 a');
		await fireEvent.click(view.getByRole('button', { name: /もっと見る|さらに表示/ }));
		void view.refresh();
		await view.findByText('本文 new');
		if (!finishOld) throw new Error('Continuation request did not start');
		finishOld(page(['stale']));
		await nextTick();
		expect(view.queryByText('本文 stale')).toBeNull();
		expect(view.queryByText('本文 a')).toBeNull();
	});

	/** Oracle: foreground re-entry invalidates previous authorization. While revalidation is pending or failed, previously displayed text must not remain visible. Continuous-foreground updates remain manual in this local version. */
	test('clears old text on foreground return and does not restore it when revalidation fails', async () => {
		let failRefresh: ((reason: unknown) => void) | undefined;
		request.mockResolvedValueOnce(page(['old'], 'position1')).mockImplementationOnce(() => new Promise((_resolve, reject) => { failRefresh = reject; }));
		const view = mount();
		await view.findByText('本文 old');
		Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
		Object.defineProperty(document, 'hidden', { configurable: true, value: true });
		document.dispatchEvent(new Event('visibilitychange'));
		Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
		Object.defineProperty(document, 'hidden', { configurable: true, value: false });
		document.dispatchEvent(new Event('visibilitychange'));
		await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
		expect(view.queryByText('本文 old')).toBeNull();
		expect(request.mock.calls[1][1].cursor).toBeUndefined();
		expect(view.getByText(/確認中|読み込み中/)).toBeTruthy();
		if (!failRefresh) throw new Error('Refresh request did not start');
		failRefresh({ code: 'UNAVAILABLE' });
		await view.findByRole('button', { name: '再試行' });
		expect(view.queryByText('本文 old')).toBeNull();
	});

	test('clears old text immediately on explicit refresh and leaves it hidden after failure', async () => {
		let rejectRefresh: ((reason: unknown) => void) | undefined;
		request.mockResolvedValueOnce(page(['old'], 'position1')).mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRefresh = reject; }));
		const view = mount();
		await view.findByText('本文 old');
		void view.refresh();
		await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
		expect(view.queryByText('本文 old')).toBeNull();
		expect(request.mock.calls[1][1]).toMatchObject({ refresh: true });
		expect(request.mock.calls[1][1].cursor).toBeUndefined();
		if (!rejectRefresh) throw new Error('Refresh request did not start');
		rejectRefresh({ code: 'UNAVAILABLE' });
		await view.findByRole('button', { name: '再試行' });
		expect(view.queryByText('本文 old')).toBeNull();
	});

	test('invalidates expired or authorization-changed pagination instead of retaining stale cards', async () => {
		request.mockResolvedValueOnce(page(['old'], 'position1')).mockRejectedValueOnce({ code: 'REFRESH_REQUIRED' })
			.mockResolvedValueOnce(page(['fresh'], null, 'snapshot2'));
		const view = mount();
		await view.findByText('本文 old');
		await fireEvent.click(view.getByRole('button', { name: /もっと見る|さらに表示/ }));
		await waitFor(() => expect(view.queryByText('本文 old')).toBeNull());
		expect(request).toHaveBeenCalledTimes(2);
		await fireEvent.click(await view.findByRole('button', { name: '再試行' }));
		await view.findByText('本文 fresh');
		expect(request.mock.calls[2][1].cursor).toBeUndefined();
	});

	test('sends separate author feedback and requires refresh before paging with a new revision', async () => {
		request.mockResolvedValueOnce(page(['a'], 'position1')).mockResolvedValueOnce({ revision: 1, refreshRequired: true })
			.mockImplementation(async route => route === 'notes/hanami-recommendations' ? { ...page(['new'], null, 'snapshot2'), revision: 1 } : acknowledgeObservations(route));
		const view = mount();
		await view.findByText('本文 a');
		await fireEvent.click(view.getByRole('button', { name: 'ノートのメニュー' }));
		const buttons = await menuButtons(popupMenu.mock.calls[0][0]);
		expect(buttons.map(button => button.text)).toContain('この作者をもっと表示');
		expect(buttons.map(button => button.text)).toContain('この作者の調整をリセット');
		const less = buttons.find(button => button.text === 'この作者を減らす');
		if (!less) throw new Error('Missing author less action');
		less.action(new MouseEvent('click'));
		await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
		expect(request.mock.calls[1]).toEqual(['hanami-feedback', expect.objectContaining({
			eventId: expect.any(String), action: 'less', target: { kind: 'author', id: 'bob' }, snapshotId: 'snapshot1', entryId: 'entry-a',
		})]);
		await nextTick();
		const more = view.queryByRole('button', { name: /もっと見る|さらに表示/ });
		expect(more == null || (more as HTMLButtonElement).disabled).toBe(true);
		void view.refresh();
		await view.findByText('本文 new');
		expect(request.mock.calls[2][1].cursor).toBeUndefined();
	});

	test.each([
		['author', 'bob', 'more', 'この作者をもっと表示'],
		['author', 'bob', 'reset', 'この作者の調整をリセット'],
		['tag', '猫', 'more', '#猫をもっと表示'],
		['tag', '猫', 'less', '#猫を減らす'],
		['tag', '猫', 'reset', '#猫の調整をリセット'],
		['note', 'a', 'more', 'この内容に近い投稿をもっと表示'],
		['note', 'a', 'less', 'この内容に近い投稿を減らす'],
		['note', 'a', 'reset', 'この内容の調整をリセット'],
	])('sends %s %s %s from its visible adjustment menu', async (kind, id, action, label) => {
		request.mockResolvedValueOnce(page(['a'])).mockResolvedValueOnce({ revision: 1, refreshRequired: true }).mockImplementation(acknowledgeObservations);
		const view = mount();
		await view.findByText('本文 a');
		await fireEvent.click(view.getByRole('button', { name: 'ノートのメニュー' }));
		const buttons = await menuButtons(popupMenu.mock.calls[0][0]);
		const choice = buttons.find(button => button.text === label);
		expect(choice).toBeDefined();
		if (!choice) throw new Error(`Missing action ${label}`);
		choice.action(new MouseEvent('click'));
		await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
		expect(request.mock.calls[1]).toEqual(['hanami-feedback', expect.objectContaining({ eventId: expect.any(String), target: { kind, id }, action, snapshotId: 'snapshot1', entryId: 'entry-a' })]);
	});

	test('does not offer text similarity feedback for a textless image card', async () => {
		const result = page(['image']);
		Object.assign(result.items[0].note, { text: null, cw: null, tags: [], fileIds: ['file1'] });
		request.mockResolvedValue(result);
		const view = mount();
		await view.findByText('image');
		await fireEvent.click(view.getByRole('button', { name: 'ノートのメニュー' }));
		const buttons = await menuButtons(popupMenu.mock.calls[0][0]);
		expect(buttons.some(button => button.text.includes('この内容'))).toBe(false);
		expect(buttons.some(button => button.text === 'この作者をもっと表示')).toBe(true);
	});
});

/** Oracle: docs/hanami-recommendations-page-contract.md requires the ordinary loadMore/enableInfiniteScroll/appear interaction, with cursor-based continuation. Real Vue mounts the real directive; only IntersectionObserver geometry and HTTP are doubled. Existing manual race, authorization, feedback and impression cases above remain the controls for their separate contracts. */
describe('recommendation pagination at the appear observer boundary', () => {
	beforeEach(() => { vi.useFakeTimers(); });

	async function settle() {
		await vi.advanceTimersByTimeAsync(500);
		await nextTick();
	}

	function noteIds(view: ReturnType<typeof mount>) {
		return [...view.container.querySelectorAll('[data-note-id]')].map(element => element.getAttribute('data-note-id'));
	}

	test('fetches a short page in received order from its cursor and file condition only when the end appears', async () => {
		preferences.enableInfiniteScroll = true;
		request.mockResolvedValueOnce(page(['z', 'a'], 'position1')).mockResolvedValueOnce(page(['m', 'b']));
		const view = mount(true);
		await settle();
		expect(view.getByRole('button', { name: 'もっと見る' })).toBeTruthy();
		expect(request).toHaveBeenCalledTimes(1);
		AppearObserver.viewport(true);
		await settle();
		expect(request.mock.calls[1]).toEqual(['notes/hanami-recommendations', { limit: 20, withFiles: true, cursor: 'position1', utcOffsetMinutes: 345, deviceContext: { deviceClass: 'desktop', viewportClass: 'wide', primaryPointer: 'fine' } }]);
		expect(noteIds(view)).toEqual(['z', 'a', 'm', 'b']);
		expect(observed.map(item => item.event.snapshotId)).toEqual(['snapshot1', 'snapshot1', 'snapshot1', 'snapshot1']);
		expect(view.queryByRole('button', { name: 'もっと見る' })).toBeNull();
		AppearObserver.viewport(false);
		AppearObserver.viewport(true);
		await settle();
		expect(request).toHaveBeenCalledTimes(2);
	});

	test('keeps manual continuation when infinite scrolling is disabled', async () => {
		request.mockResolvedValueOnce(page(['a'], 'position1')).mockResolvedValueOnce(page(['b']));
		const view = mount();
		await settle();
		AppearObserver.viewport(true);
		await settle();
		expect(request).toHaveBeenCalledTimes(1);
		await fireEvent.click(view.getByRole('button', { name: 'もっと見る' }));
		await settle();
		expect(noteIds(view)).toEqual(['a', 'b']);
		expect(request).toHaveBeenCalledTimes(2);
	});

	test('does not issue a second continuation while an observer request is loading', async () => {
		preferences.enableInfiniteScroll = true;
		let finish: ((value: ReturnType<typeof page>) => void) | undefined;
		request.mockResolvedValueOnce(page(['a'], 'position1')).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
		const view = mount();
		await settle();
		AppearObserver.viewport(true);
		await settle();
		expect(request).toHaveBeenCalledTimes(2);
		expect(view.getByText('確認中')).toBeTruthy();
		const more = view.queryByRole('button', { name: 'もっと見る' });
		if (more) {
			expect((more as HTMLButtonElement).disabled).toBe(true);
			await fireEvent.click(more);
		}
		AppearObserver.viewport(false);
		AppearObserver.viewport(true);
		await settle();
		expect(request).toHaveBeenCalledTimes(2);
		if (!finish) throw new Error('The visible end did not request a continuation');
		finish(page(['b']));
		await settle();
		expect(noteIds(view)).toEqual(['a', 'b']);
	});

	test('continues through an empty middle page while the end remains visible', async () => {
		preferences.enableInfiniteScroll = true;
		request.mockResolvedValueOnce(page(['a'], 'position1')).mockResolvedValueOnce(page([], 'position2')).mockResolvedValueOnce(page(['b']));
		const view = mount();
		await settle();
		AppearObserver.viewport(true);
		await settle();
		expect(request.mock.calls.map(([, body]) => body.cursor)).toEqual([undefined, 'position1', 'position2']);
		expect(noteIds(view)).toEqual(['a', 'b']);
		expect(view.queryByRole('button', { name: 'もっと見る' })).toBeNull();
	});

	test('stops automatic retry after failure and retries the same cursor explicitly', async () => {
		preferences.enableInfiniteScroll = true;
		request.mockResolvedValueOnce(page(['a'], 'position1')).mockRejectedValueOnce({ code: 'UNAVAILABLE' }).mockResolvedValueOnce(page(['b']));
		const view = mount();
		await settle();
		AppearObserver.viewport(true);
		await settle();
		expect(request).toHaveBeenCalledTimes(2);
		expect(view.getByRole('button', { name: '再試行' })).toBeTruthy();
		expect(noteIds(view)).toEqual(['a']);
		AppearObserver.viewport(false);
		AppearObserver.viewport(true);
		await settle();
		expect(request).toHaveBeenCalledTimes(2);
		await fireEvent.click(view.getByRole('button', { name: '再試行' }));
		await settle();
		expect(request.mock.calls[2]).toEqual(request.mock.calls[1]);
		expect(noteIds(view)).toEqual(['a', 'b']);
	});

	/** Oracle: a new fetch generation stays pending until its own response, even when an earlier continuation completes. The MkLoading double uses text to expose that pending state; this assertion does not require the former text element's ARIA role or verify the native spinner's rendering. */
	test.each(['explicit refresh', 'foreground return', 'file condition change'])('does not let an old observer response reset the loading state after %s', async trigger => {
		preferences.enableInfiniteScroll = true;
		let finishOld: ((value: ReturnType<typeof page>) => void) | undefined;
		let finishNew: ((value: ReturnType<typeof page>) => void) | undefined;
		request.mockResolvedValueOnce(page(['old'], 'position1'))
			.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
			.mockImplementationOnce(() => new Promise(resolve => { finishNew = resolve; }));
		const view = mount();
		await settle();
		AppearObserver.viewport(true);
		await settle();
		expect(request).toHaveBeenCalledTimes(2);
		if (trigger === 'explicit refresh') {
			void view.refresh();
		} else if (trigger === 'file condition change') {
			view.setWithFiles(true);
		} else {
			Object.defineProperty(document, 'hidden', { configurable: true, value: true });
			Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
			document.dispatchEvent(new Event('visibilitychange'));
			Object.defineProperty(document, 'hidden', { configurable: true, value: false });
			Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
			document.dispatchEvent(new Event('visibilitychange'));
		}
		await settle();
		if (!finishOld || !finishNew) throw new Error('Both generations must have started');
		finishOld(page(['stale'], 'stale-position'));
		await settle();
		expect(noteIds(view)).toEqual([]);
		expect(view.getByText('確認中')).toBeTruthy();
		finishNew(page(['new'], null, 'snapshot2'));
		await settle();
		expect(noteIds(view)).toEqual(['new']);
		expect(request).toHaveBeenCalledTimes(3);
	});

	test('disconnects the end observer and ignores a pending continuation after unmount', async () => {
		preferences.enableInfiniteScroll = true;
		let finish: ((value: ReturnType<typeof page>) => void) | undefined;
		request.mockResolvedValueOnce(page(['a'], 'position1')).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
		const view = mount();
		await settle();
		AppearObserver.viewport(true);
		await settle();
		expect(request).toHaveBeenCalledTimes(2);
		view.unmount();
		if (!finish) throw new Error('The visible end did not request a continuation');
		finish(page(['stale'], 'position2'));
		await settle();
		expect(AppearObserver.instances.every(observer => observer.targets.size === 0)).toBe(true);
		expect(observed.map(item => item.event.entryId)).toEqual(['entry-a']);
		AppearObserver.viewport(true);
		await settle();
		expect(request).toHaveBeenCalledTimes(2);
	});
});

/** Oracle: contract v4 connects actual recommendation cards to bounded delivery and keeps raw ordering. Detailed retry/TTL limits are exercised independently in hanami-observation-delivery.test.ts; these tests retain the production component-to-transport boundary. */
describe('v4 observation transport from the real recommendation component', () => {
	beforeEach(() => { vi.useFakeTimers(); });
	const settle = async (ms = 0) => { await vi.advanceTimersByTimeAsync(ms); await nextTick(); };
	const writes = () => request.mock.calls.filter(([route]) => route === 'hanami-impressions').map(([, body]) => body as { version: number; observations: Observation[] });

	test('sends ordered raw records for the rendered note through the single v4 batch endpoint', async () => {
		request.mockImplementation(async route => route === 'notes/hanami-recommendations' ? page(['a']) : undefined);
		mount();
		await settle();
		const records = [0, 1, 2].map(sequence => measurement(observed[0].event, sequence));
		for (const record of records) trackerCallbacks[0](record);
		await settle(250);
		expect(writes()).toEqual([{ version: 4, observations: records }]);
		expect(records.every(record => record.noteId === 'a' && record.entryId === 'entry-a')).toBe(true);
		expect(trackerResume).toHaveBeenCalledTimes(1);
	});

	test('automatically retries an unchanged failed batch before sending newer measurements', async () => {
		let attempts = 0;
		request.mockImplementation(async route => {
			if (route === 'notes/hanami-recommendations') return page(['a']);
			if (++attempts === 1) throw new Error('Connection interrupted');
			return undefined;
		});
		mount();
		await settle();
		const first = measurement(observed[0].event);
		trackerCallbacks[0](first);
		await settle(250);
		const second = measurement(observed[0].event, 1);
		trackerCallbacks[0](second);
		await settle(499);
		expect(writes()).toHaveLength(1);
		await settle(1);
		expect(writes()[1]).toEqual(writes()[0]);
		await settle(250);
		expect(writes()[2].observations).toEqual([second]);
	});

	test('retains failed observations when the file condition changes to a new snapshot', async () => {
		let attempts = 0;
		request.mockImplementation(async (route, body) => {
			if (route === 'notes/hanami-recommendations') return body.withFiles ? page(['new'], null, 'snapshot2') : page(['old']);
			if (++attempts === 1) throw new Error('Connection interrupted');
			return undefined;
		});
		const view = mount();
		await settle();
		const first = measurement(observed[0].event);
		trackerCallbacks[0](first);
		await settle(250);
		view.setWithFiles(true);
		await settle();
		const next = observed.find(value => value.event.entryId === 'entry-new');
		if (!next) throw new Error('New snapshot note was not observed');
		const fresh = measurement(next.event);
		trackerCallbacks[0](fresh);
		await settle(1_000);
		expect(writes()[0].observations).toEqual([first]);
		expect(writes()[1].observations).toEqual([first]);
		expect(writes().flatMap(batch => batch.observations)).toContainEqual(fresh);
	});

	test('bounds the component queue at 1000 records and preserves 100-record batches during a pending send', async () => {
		let release!: () => void;
		request.mockImplementation(async route => {
			if (route === 'notes/hanami-recommendations') return page(['a']);
			return new Promise<void>(resolve => { release = resolve; });
		});
		mount();
		await settle();
		const records = Array.from({ length: 1_001 }, (_, sequence) => measurement(observed[0].event, sequence));
		expect(records.slice(0, 1_000).every(record => trackerCallbacks[0](record) !== false)).toBe(true);
		expect(trackerCallbacks[0](records[1_000])).toBe(false);
		await settle(250);
		expect(writes()).toHaveLength(1);
		expect(writes()[0].observations).toEqual(records.slice(0, 100));
		await settle(1_000);
		expect(writes()).toHaveLength(1);
		release();
		await settle(250);
		expect(writes()[1].observations).toEqual(records.slice(100, 200));
		for (let batch = 1; batch < 10; batch++) { release(); await settle(250); }
		expect(writes()).toHaveLength(10);
	});
});

/** Oracle: raw v4 observation lifecycles must be wired to the real component. Receipt ACKs do not end active collection, an inactive mount sends no further records after its terminal observation, and departures preserve queued terminal observations without concurrent sends. Browser geometry is doubled because happy-dom has no layout; the component and observer are real. */
describe('v4 observation lifecycle through the component and real tracker', () => {
	beforeEach(() => { trackerMode.real = true; vi.useFakeTimers(); });
	const settle = async (ms = 0) => { await vi.advanceTimersByTimeAsync(ms); await nextTick(); };
	const writes = () => request.mock.calls.filter(([route]) => route === 'hanami-impressions').map(([, body]) => body as { version: number; observations: Observation[] });

	test.each(['pagehide', 'unmount'])('retains the terminal observation after an in-flight send during %s', async departure => {
		const finish: (() => void)[] = [];
		request.mockImplementation(async route => {
			if (route === 'notes/hanami-recommendations') return page(['a']);
			return new Promise<void>(resolve => { finish.push(resolve); });
		});
		const view = mount();
		await settle(500);
		expect(writes()).toHaveLength(1);
		if (departure === 'pagehide') window.dispatchEvent(new Event('pagehide'));
		else view.unmount();
		await settle();
		expect(writes()).toHaveLength(1);
		finish[0]();
		await settle(250);
		expect(writes()).toHaveLength(2);
		expect(writes()[1].observations).toContainEqual(expect.objectContaining({ ended: true, elapsedMs: 500 }));
		finish[1]();
		await settle(1_000);
		expect(writes()).toHaveLength(2);
		expect(writes().every(batch => batch.version === 4)).toBe(true);
	});

	test('continues beyond a receipt ACK and starts a new series after page return', async () => {
		request.mockImplementation(async route => route === 'notes/hanami-recommendations' ? page(['a']) : undefined);
		mount();
		await settle(1_250);
		const firstId = writes()[0].observations[0].eventId;
		expect(writes().flatMap(batch => batch.observations)).toContainEqual(expect.objectContaining({ eventId: firstId, elapsedMs: 1_000, ended: false }));
		window.dispatchEvent(new Event('pagehide'));
		await settle(250);
		window.dispatchEvent(new Event('pageshow'));
		await settle(500);
		const restarts = writes().flatMap(batch => batch.observations).filter(record => record.sequence === 0 && record.eventId !== firstId);
		expect(restarts).toHaveLength(1);
		expect(restarts[0]).toMatchObject({ elapsedMs: 0, ended: false });
	});

	test('sends no further records after an inactive mount when later ACKs or timers arrive', async () => {
		trackerMode.active = false;
		request.mockImplementation(async route => route === 'notes/hanami-recommendations' ? page(['a']) : undefined);
		mount();
		await settle(2_000);
		const records = writes().flatMap(batch => batch.observations);
		expect(records.length).toBeGreaterThan(0);
		expect(records.every(record => record.kind === 'viewport' && record.activityAgeMs === Number.MAX_SAFE_INTEGER)).toBe(true);
		expect(records.at(-1)).toMatchObject({ ended: true });
		const count = writes().length;
		await settle(60_000);
		expect(writes()).toHaveLength(count);
	});
});

/** Oracle: window-api §1/2. The real recommendation menu keeps the first operation handle across manual retries; a saved setting remains successful even when its optional observation cannot complete. */
describe('feedback operation windows from the real recommendation menu', () => {
	let run = 0;
	beforeEach(() => { vi.useFakeTimers({ toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] }); });
	const settle = async (ms = 0) => { await vi.advanceTimersByTimeAsync(ms); await nextTick(); };
	const records = (): Record<string, unknown>[] => request.mock.calls.filter(([route]) => route === 'hanami-impressions').flatMap(([, body]) => body.observations);
	const closes = () => records().filter(record => record.kind === 'window' && record.phase === 'close');

	async function begin() {
		const view = mount(); await settle();
		trackerCallbacks[0]({ ...measurement(observed[0].event), visibleArea: 1 });
		return view;
	}

	async function less(view: ReturnType<typeof mount>) {
		await fireEvent.click(view.getByRole('button', { name: 'ノートのメニュー' }));
		const action = (await menuButtons(popupMenu.mock.calls.at(-1)![0])).find(item => item.text === 'この作者を減らす');
		if (!action) throw new Error('Missing real author-less menu action');
		return action.action(new MouseEvent('click'));
	}

	test('sends one receipt referencing the actual successful feedback and completes after card unmount', async () => {
		const snapshot = `window-feedback-${++run}`;
		request.mockImplementation(async route => route === 'notes/hanami-recommendations' ? page(['a'], null, snapshot) : route === 'hanami-feedback' ? { revision: 1, refreshRequired: true } : undefined);
		const view = await begin();
		await less(view); await settle(500); view.unmount(); await settle(60_000);
		const submitted = request.mock.calls.find(([route]) => route === 'hanami-feedback')?.[1];
		expect(records().filter(record => record.kind === 'feedback')).toEqual([expect.objectContaining({ eventId: submitted.eventId, windowId: expect.any(String) })]);
		expect(closes()).toEqual([expect.objectContaining({ complete: true })]);
	});

	test('ACK lost at t5 then retry ACK at t40 does not create a late feedback receipt or a new operation', async () => {
		let attempts = 0;
		const snapshot = `window-feedback-${++run}`;
		request.mockImplementation(async route => {
			if (route === 'notes/hanami-recommendations') return page(['a'], null, snapshot);
			if (route === 'hanami-feedback') { if (++attempts === 1) throw new Error('saved but ACK lost'); return { revision: 1, refreshRequired: true }; }
			return undefined;
		});
		const view = await begin();
		await settle(5_000); await less(view); await settle(35_000); await less(view); await settle(20_500);
		const attemptsSent = request.mock.calls.filter(([route]) => route === 'hanami-feedback');
		expect(attemptsSent).toHaveLength(2);
		expect(attemptsSent[1][1]).toEqual(attemptsSent[0][1]);
		expect(records().filter(record => record.kind === 'feedback')).toEqual([]);
		expect(closes()).toEqual([expect.objectContaining({ complete: false })]);
		expect(view.queryByRole('alert')).toBeNull();
	});

	test('a first success after sixty seconds preserves settings success and sends a windowless receipt', async () => {
		let finish!: (value: { revision: number; refreshRequired: boolean }) => void;
		const pending = new Promise(resolve => { finish = resolve; });
		const snapshot = `window-feedback-${++run}`;
		request.mockImplementation(async route => route === 'notes/hanami-recommendations' ? page(['a'], null, snapshot) : route === 'hanami-feedback' ? pending : undefined);
		const view = await begin();
		const action = less(view); await settle(61_000); finish({ revision: 1, refreshRequired: true }); await action; await settle(500);
		const receipts = records().filter(record => record.kind === 'feedback');
		expect(receipts).toHaveLength(1);
		expect(receipts[0]).not.toHaveProperty('windowId');
		expect(closes()).toEqual([expect.objectContaining({ complete: false })]);
		expect(view.queryByRole('alert')).toBeNull();
	});
});
