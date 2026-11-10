/// <reference types="vite/client" />
/* eslint-disable vue/one-component-per-file -- The header and leaf doubles expose the actual timeline page's actions, bindings and refresh calls. */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { defineComponent, h, nextTick, unref } from 'vue';
import type { PropType } from 'vue';
import type { MenuItem, MenuSwitch } from '@/types/menu.js';

const { popupMenu, refresh, reload, device } = vi.hoisted(() => ({ popupMenu: vi.fn(), refresh: vi.fn(), reload: vi.fn(), device: { kind: 'desktop' } }));
vi.mock('@/os.js', () => ({ popupMenu }));
vi.mock('@/i.js', () => ({ $i: { id: 'alice', policies: { hanamiTlAvailable: true, ltlAvailable: true, gtlAvailable: true } } }));
vi.mock('@/instance.js', () => ({ instance: { hanamiRecommendationsEnabled: true, policies: {} } }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/cache.js', () => ({ antennasCache: {}, userListsCache: {}, favoritedChannelsCache: {} }));
vi.mock('@/utility/device-kind.js', () => ({ get deviceKind() { return device.kind; } }));
vi.mock('@/local-storage.js', () => ({ miLocalStorage: { getItemAsJson: vi.fn() } }));
vi.mock('@/store.js', async () => {
	const { ref } = await import('vue');
	const state = { tl: { src: 'hanami', filter: { withRenotes: true, withReplies: false, onlyFiles: true, withSensitive: false } }, hanamiRecommendationWithFiles: false, hanamiRecommendationImageFilter: 'with_image' };
	const reactiveState = { tl: ref(state.tl), hanamiRecommendationWithFiles: ref(state.hanamiRecommendationWithFiles), hanamiRecommendationImageFilter: ref(state.hanamiRecommendationImageFilter) };
	return { store: { s: state, r: reactiveState, set: vi.fn((key: keyof typeof state, value: never) => { state[key] = value; reactiveState[key].value = value; }) } };
});
vi.mock('@/preferences.js', async () => {
	const { ref, reactive } = await import('vue');
	const showFixedPostForm = ref(false);
	return { prefer: { r: { pinnedUserLists: ref([]), showFixedPostForm }, s: reactive({ enablePullToRefresh: false }), model: () => showFixedPostForm } };
});
vi.mock('@/i18n.js', async () => {
	const { default: locale } = await import('../../../../locales/ja-JP.yml?raw');
	const { load } = await import('js-yaml');
	return { i18n: { ts: load(locale) } };
});
vi.mock('@/components/MkHanamiRecommendations.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({ props: { withFiles: Boolean }, setup(props, { expose }) {
		expose({ refresh });
		return () => h('p', { 'data-testid': 'recommendations-filter' }, String(props.withFiles));
	} }) };
});
vi.mock('@/components/MkStreamingNotesTimeline.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({ props: { onlyFiles: Boolean, withReplies: Boolean }, setup(props, { expose }) {
		expose({ reloadTimeline: reload });
		return () => h('p', { 'data-testid': 'normal-filter' }, JSON.stringify(props));
	} }) };
});
vi.mock('@/components/MkPostForm.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkPullToRefresh.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({ props: { refresher: { type: Function, default: undefined } }, setup(props, { slots }) {
		return () => h('section', [h('button', { onClick: () => props.refresher?.() }, 'pull refresh'), slots.default?.()]);
	} }) };
});

import { store } from '@/store.js';
import { prefer } from '@/preferences.js';

type HeaderAction = { text: string; handler: (event: MouseEvent) => void };
const header = defineComponent({ props: { actions: { type: Array as PropType<HeaderAction[]>, default: () => [] } }, setup(props, { slots }) {
	return () => h('main', [h('header', props.actions.map(action => h('button', { onClick: action.handler }, action.text))), slots.default?.()]);
} });

async function mount() {
	const { default: Timeline } = await import('@/pages/timeline.vue');
	return render(Timeline, { global: { stubs: { PageWithHeader: header, MkTip: true } } });
}

async function options(view: Awaited<ReturnType<typeof mount>>) {
	await fireEvent.click(view.getByRole('button', { name: 'オプション' }));
	const call = popupMenu.mock.calls.at(-1);
	if (!call) throw new Error('Timeline options did not open');
	return await Promise.all(call[0] as MenuItem[]);
}

function fileSwitch(items: Awaited<ReturnType<typeof options>>): MenuSwitch {
	const item = items.find(item => item.type === 'switch' && item.text === 'ファイル付きのみ');
	expect(item).toMatchObject({ type: 'switch', text: 'ファイル付きのみ', icon: 'ti ti-photo' });
	if (item?.type !== 'switch') throw new Error('Header options must contain the ordinary file switch');
	return item;
}

beforeEach(() => {
	device.kind = 'desktop';
	store.r.tl.value = store.s.tl = { ...store.s.tl, src: 'hanami', filter: { withRenotes: true, withReplies: false, onlyFiles: true, withSensitive: false } };
	const filter = store as unknown as { s: { hanamiRecommendationWithFiles: boolean }; r: { hanamiRecommendationWithFiles: { value: boolean } } };
	filter.r.hanamiRecommendationWithFiles.value = filter.s.hanamiRecommendationWithFiles = false;
	prefer.s.enablePullToRefresh = false;
	prefer.r.showFixedPostForm.value = false;
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.resetModules(); });

/** Oracle: the user's “same as other timelines” means timeline.vue's header reload/options, existing MenuSwitch and common fixed-post-form switch. Recommendation filtering must stay separate from normal timeline filters and survive component remounts. */
describe('Hanami timeline header controls', () => {
	test('exposes desktop reload and recommendation-only options without changing the normal filters', async () => {
		const view = await mount();
		await fireEvent.click(view.getByRole('button', { name: 'リロード' }));
		expect(refresh).toHaveBeenCalledTimes(1);
		const menu = await options(view);
		const files = fileSwitch(menu);
		expect(files.ref.value).toBe(false);
		expect(menu.some(item => item.type === 'radio' || item.type === 'parent')).toBe(false);
		expect(menu.filter(item => item.type === 'switch').map(item => 'text' in item ? item.text : null)).toEqual(expect.arrayContaining(['ファイル付きのみ', 'タイムライン上部に投稿フォームを表示する']));
		const fixed = menu.find(item => item.type === 'switch' && item.text === 'タイムライン上部に投稿フォームを表示する') as MenuSwitch;
		fixed.ref.value = true;
		expect(prefer.r.showFixedPostForm.value).toBe(true);
		const normalFilters = { ...store.s.tl.filter };
		for (const value of [true, false, true]) {
			files.ref.value = value;
			await nextTick();
			expect(view.getByTestId('recommendations-filter').textContent).toBe(String(value));
			expect(store.set).toHaveBeenLastCalledWith('hanamiRecommendationWithFiles', value);
			expect(store.s.tl.filter).toEqual(normalFilters);
		}
		store.r.tl.value.src = 'home';
		await nextTick();
		expect(view.queryByTestId('recommendations-filter')).toBeNull();
		expect(view.getByTestId('normal-filter').textContent).toContain('"onlyFiles":true');
		expect((await options(view)).some(item => item.type === 'radio')).toBe(false);
	});

	test('restores the saved file switch when the timeline is remounted', async () => {
		const first = await mount();
		fileSwitch(await options(first)).ref.value = true;
		await nextTick();
		first.unmount();
		const second = await mount();
		expect(second.getByTestId('recommendations-filter').textContent).toBe('true');
		expect(fileSwitch(await options(second)).ref.value).toBe(true);
	});

	test.each([false, true])('keeps file settings and explicit refresh reachable on mobile with pull-to-refresh=%s', async enabled => {
		device.kind = 'smartphone';
		prefer.s.enablePullToRefresh = enabled;
		const view = await mount();
		fileSwitch(await options(view)).ref.value = true;
		await nextTick();
		expect(view.getByTestId('recommendations-filter').textContent).toBe('true');
		const reloadButton = view.queryByRole('button', { name: 'リロード' });
		if (reloadButton) await fireEvent.click(reloadButton);
		else {
			const action = (await options(view)).find(item => 'text' in item && item.text === 'リロード' && 'action' in item);
			expect(action).toBeDefined();
			if (action && 'action' in action) action.action(new MouseEvent('click'));
		}
		await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
	});

	/** Oracle: the ordinary TL disables onlyFiles while withReplies is active; recommendation file filtering has no such restriction. */
	test('keeps the recommendation switch enabled when normal timeline replies are enabled', async () => {
		store.r.tl.value.filter.withReplies = true;
		const view = await mount();
		const files = fileSwitch(await options(view));
		expect(unref(files.disabled)).not.toBe(true);
		files.ref.value = true;
		await nextTick();
		expect(view.getByTestId('recommendations-filter').textContent).toBe('true');
		expect(store.s.tl.filter.withReplies).toBe(true);
	});

	test('keeps normal timeline options and reload unchanged', async () => {
		store.r.tl.value.src = 'home';
		const view = await mount();
		await fireEvent.click(view.getByRole('button', { name: 'リロード' }));
		expect(reload).toHaveBeenCalledTimes(1);
		expect(refresh).not.toHaveBeenCalled();
		const menu = await options(view);
		expect(menu.some(item => item.type === 'radio')).toBe(false);
		expect(menu.filter(item => item.type === 'switch')).toHaveLength(4);
		expect(view.getByTestId('normal-filter').textContent).toContain('"onlyFiles":true');
	});
});
