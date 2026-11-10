import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/vue';
import { defineComponent, h } from 'vue';

const { state, api } = vi.hoisted(() => ({ state: { enabled: false }, api: vi.fn() }));
vi.mock('@/i.js', () => ({ $i: { id: 'alice', policies: { hanamiTlAvailable: true, ltlAvailable: true, gtlAvailable: true } } }));
vi.mock('@/instance.js', () => ({ instance: { get hanamiRecommendationsEnabled() { return state.enabled; }, policies: {} } }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: api }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/os.js', () => ({ popupMenu: vi.fn() }));
vi.mock('@/cache.js', () => ({ antennasCache: {}, userListsCache: {}, favoritedChannelsCache: {} }));
vi.mock('@/utility/device-kind.js', () => ({ deviceKind: 'desktop' }));
vi.mock('@/local-storage.js', () => ({ miLocalStorage: { getItemAsJson: vi.fn() } }));
vi.mock('@/store.js', async () => {
	const { ref } = await import('vue');
	const tl = { src: 'hanami', filter: { withRenotes: true, withReplies: false, onlyFiles: false, withSensitive: true } };
	return { store: { s: { tl }, r: { tl: ref(tl), hanamiRecommendationWithFiles: ref(false), hanamiRecommendationImageFilter: ref('any') }, set: vi.fn() } };
});
vi.mock('@/preferences.js', async () => {
	const { ref } = await import('vue');
	return { prefer: { r: { pinnedUserLists: ref([]), showFixedPostForm: ref(false) }, s: { enablePullToRefresh: false }, model: () => ref(false) } };
});
vi.mock('@/i18n.js', () => ({ i18n: { ts: { _timelineDescription: { hanami: 'Hanami' }, _timelines: { home: 'Home', hanami: 'Hanami', local: 'Local', social: 'Social', global: 'Global' } } } }));
vi.mock('@/components/MkStreamingNotesTimeline.vue', async () => {
	const { h } = await import('vue');
	return { default: { render: () => h('p', 'legacy streaming timeline') } };
});
vi.mock('@/components/MkPostForm.vue', async () => {
	const { h } = await import('vue');
	return { default: { render: () => h('div') } };
});
vi.mock('@/components/MkHanamiRecommendations.vue', async () => {
	const { h } = await import('vue');
	return { default: { render: () => h('p', 'HTTP recommendations') } };
});

afterEach(() => { cleanup(); vi.resetModules(); state.enabled = false; api.mockReset(); });

/** Oracle: platform configuration presence controls the new timeline. An absent configuration preserves the legacy timeline component (this test checks selection with a component stub); present-but-invalid configuration still selects the explicit-unavailable HTTP screen. */
describe('Hanami timeline feature selection', () => {
	test.each([false, true])('uses the configured meta flag %s', async enabled => {
		state.enabled = enabled;
		const { default: Timeline } = await import('@/pages/timeline.vue');
		const passthrough = defineComponent({ setup(_props, { slots }) { return () => h('div', slots.default?.()); } });
		const view = render(Timeline, { global: { stubs: { PageWithHeader: passthrough, MkTip: passthrough } } });
		await waitFor(() => expect(view.queryByText('legacy streaming timeline') != null).toBe(!enabled));
		expect(view.queryByText('HTTP recommendations') != null).toBe(enabled);
	});
});
