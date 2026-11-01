/// <reference types="vite/client" />
/* eslint-disable vue/one-component-per-file -- Rendering leaves are isolated while MkNote, the recommendation component and getNoteMenu stay real. */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { defineComponent, h, nextTick } from 'vue';
import type * as Misskey from 'misskey-js';
import type { MenuItem } from '@/types/menu.js';

const { request, popupMenu, contextMenu, userCleanup, stream, viewer } = vi.hoisted(() => ({
	request: vi.fn(), popupMenu: vi.fn(), contextMenu: vi.fn(), userCleanup: vi.fn(), stream: { send: vi.fn(), on: vi.fn(), off: vi.fn() },
	viewer: { id: 'alice', policies: {}, mutedWords: [], hardMutedWords: [] as string[][] },
}));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: request, misskeyApiGet: request }));
vi.mock('@/os.js', () => ({ popupMenu, contextMenu }));
vi.mock('@/i.js', () => ({ $i: viewer }));
vi.mock('@/instance.js', () => ({ instance: {} }));
vi.mock('@/store.js', () => ({ store: { s: { realtimeMode: true } } }));
vi.mock('@/stream.js', () => ({ useStream: () => stream }));
vi.mock('@/preferences.js', async () => {
	const { ref } = await import('vue');
	return { prefer: { s: { pollingInterval: 3, noteMenu: [], useReactionPickerForContextMenu: false, enablePullToRefresh: false }, r: { enableInfiniteScroll: ref(false) } } };
});
vi.mock('@/plugin.js', () => ({ getPluginHandlers: () => [] }));
vi.mock('@/utility/reaction-picker.js', () => ({ reactionPicker: {} }));
vi.mock('@/utility/achievements.js', () => ({ claimAchievement: vi.fn() }));
vi.mock('@/utility/sound.js', () => ({ playMisskeySfx: vi.fn() }));
vi.mock('@/composables/use-tooltip.js', () => ({ useTooltip: vi.fn() }));
vi.mock('@/utility/please-login.js', () => ({ pleaseLogin: vi.fn() }));
vi.mock('@/utility/show-moved-dialog.js', () => ({ showMovedDialog: vi.fn() }));
vi.mock('@/utility/get-user-menu.js', () => ({ getUserMenu: () => ({ menu: [], cleanup: userCleanup }) }));
vi.mock('@/utility/get-embed-code.js', () => ({ genEmbedCode: vi.fn() }));
vi.mock('@/utility/copy-to-clipboard.js', () => ({ copyToClipboard: vi.fn() }));
vi.mock('@/local-storage.js', () => ({ miLocalStorage: { getItem: vi.fn() } }));
vi.mock('@/cache.js', () => ({ clipsCache: { fetch: async () => [] }, favoritedChannelsCache: { fetch: async () => [] } }));
vi.mock('@/utility/hanami-impressions.js', () => ({ createHanamiImpressionTracker: () => ({ observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn(), complete: vi.fn(), resume: vi.fn() }) }));
vi.mock('@/i18n.js', async () => {
	const { default: locale } = await import('../../../../locales/ja-JP.yml?raw');
	const { load } = await import('js-yaml');
	const ts = load(locale) as Record<string, unknown>;
	const format = (value: unknown): unknown => typeof value === 'string'
		? (params: Record<string, unknown>) => value.replace(/\{([^}]+)\}/g, (_, name: string) => String(params[name]))
		: Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, format(item)]));
	return { i18n: { ts, tsx: format(ts) } };
});
vi.mock('@/components/MkNoteHeader.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkReactionsViewer.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkReactionsViewer.details.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkMediaList.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkCwButton.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkPoll.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkUsersTooltip.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkUrlPreview.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkInstanceTicker.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkRippleEffect.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkSelect.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkNoteSimple.vue', async () => {
	const { defineComponent, h, defineAsyncComponent } = await import('vue');
	const Note = defineAsyncComponent(() => import('@/components/MkNote.vue'));
	return { default: defineComponent({ inheritAttrs: false, props: { note: { type: Object, required: true } }, setup(props, { attrs }) {
		return () => h('aside', { 'data-testid': 'quote-boundary', 'data-menu-prop': String(attrs.additionalMenuItems != null) }, [h(Note, { note: props.note as Misskey.entities.Note })]);
	} }) };
});
vi.mock('@/components/MkNoteSub.vue', async () => {
	const { defineComponent, h, defineAsyncComponent } = await import('vue');
	const Note = defineAsyncComponent(() => import('@/components/MkNote.vue'));
	return { default: defineComponent({ inheritAttrs: false, props: { note: { type: Object, required: true } }, setup(props, { attrs }) {
		return () => h('aside', { 'data-testid': 'reply-boundary', 'data-menu-prop': String(attrs.additionalMenuItems != null) }, [h(Note, { note: props.note as Misskey.entities.Note })]);
	} }) };
});

import MkNote from '@/components/MkNote.vue';
import MkHanamiRecommendations from '@/components/MkHanamiRecommendations.vue';
import MkNotesTimeline from '@/components/MkNotesTimeline.vue';
import MkResult from '@/components/global/MkResult.vue';
import { globalEvents } from '@/events.js';
import { TokenPaginator } from '@/hana/scripts/token-paginator.js';

function note(id: string): Misskey.entities.Note {
	return { id, text: `本文 ${id}`, createdAt: '2026-11-01T00:00:00.000Z', cw: null, userId: 'bob', user: { id: 'bob', name: null, username: 'bob', host: null, avatarUrl: 'https://example.test/avatar.png', avatarBlurhash: null, avatarDecorations: [], emojis: {}, onlineStatus: 'unknown' }, visibility: 'public', reactionAcceptance: 'nonSensitiveOnly', tags: ['猫'], files: [], fileIds: [], renoteId: null, replyId: null, repliesCount: 0, renoteCount: 0, reactions: {}, reactionCount: 0, reactionEmojis: {}, emojis: {}, myReaction: null };
}

function page(top = note('recommended')) {
	return { items: [{ entryId: 'entry-recommended', note: top }], nextCursor: null, snapshotId: 'snapshot1', revision: 0, algorithmVersion: 'local-v0.1.0' };
}

function mount(top = note('recommended'), withSearch = false) {
	request.mockImplementation(async (route: string) => {
		if (route === 'notes/hanami-recommendations') return page(top);
		if (route === 'notes/hanamisearch-v2') return { notes: [{ ...note('search-muted'), text: top.text }, note('search-visible')], nextCursor: null };
		if (route === 'notes/state') return { isFavorited: false, isMutedThread: false };
		if (route === 'users/show') return top.user;
		if (route === 'hanami-feedback') return { revision: 1, refreshRequired: true };
		throw new Error(`Unexpected API ${route}`);
	});
	const host = defineComponent({ setup() {
		const search = withSearch ? new TokenPaginator('notes/hanamisearch-v2', { params: { query: '花' } }) : null;
		return () => h('main', [
			h(MkHanamiRecommendations, { withFiles: false }),
			h(MkNote, { note: note('ordinary') }),
			search ? h(MkNotesTimeline, { paginator: search, withControl: false }) : null,
		]);
	} });
	const text = defineComponent({ props: { text: { type: String, default: '' } }, setup(props) { return () => h('span', props.text); } });
	return render(host, { global: { components: { MkResult }, stubs: { Mfm: text, MkAvatar: true, MkA: true, MkButton: true, MkLoading: true, MkSystemIcon: true }, directives: { hotkey: {}, 'user-preview': {}, appear: {} } } });
}

async function openMenu(view: ReturnType<typeof mount>, text: string, context = false) {
	const article = (await view.findByText(text)).closest('article');
	if (!article) throw new Error('Note article not rendered');
	if (context) await fireEvent.contextMenu(article);
	else {
		const button = [...article.querySelectorAll('footer button')].find(element => element.closest('article') === article && element.querySelector('.ti-dots'));
		if (!button) throw new Error('Existing note ellipsis not rendered');
		await fireEvent.mouseDown(button);
	}
	const calls = context ? contextMenu.mock.calls : popupMenu.mock.calls;
	const call = calls.at(-1);
	if (!call) throw new Error('Existing note menu did not open');
	return { article, menu: await Promise.all(call[0] as MenuItem[]) };
}

async function adjustment(menu: Awaited<ReturnType<typeof openMenu>>['menu']) {
	const parent = menu.find(item => item.type === 'parent' && item.text === 'おすすめの調整');
	expect(parent).toBeDefined();
	if (parent?.type !== 'parent') throw new Error('Adjustment submenu is missing from the actual note menu');
	return await Promise.all(typeof parent.children === 'function' ? await parent.children() : parent.children);
}

beforeEach(() => {
	viewer.hardMutedWords = [];
	popupMenu.mockImplementation(() => new Promise(() => {}));
	contextMenu.mockImplementation(() => new Promise(() => {}));
	Object.defineProperty(document, 'hidden', { configurable: true, value: false });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

/** Oracle: the user's ellipsis request applies only to recommended top-level notes. This test executes actual MkNote/getNoteMenu and recommendation feedback; it doubles rendering leaves and external services. Quote/reply adapters render a real second MkNote to detect accidental inherited recommendation context, and also reject explicit prop forwarding across those boundaries. */
describe('recommended note existing menu integration', () => {
	/** Oracle: the native note renderer hides hard-muted words in recommendation and search lists; a visible search note and ordinary standalone note are controls that the renderer mounted. */
	test('hides hard-muted recommendation text using the same note behavior as search', async () => {
		viewer.hardMutedWords = [['避けたい語']];
		const top = { ...note('recommended'), text: '避けたい語を含む本文' };
		const view = mount(top, true);
		await view.findByText('本文 search-visible');
		expect(view.getByText('本文 ordinary')).toBeTruthy();
		expect(request).toHaveBeenCalledWith('notes/hanami-recommendations', expect.any(Object));
		expect(request).toHaveBeenCalledWith('notes/hanamisearch-v2', expect.any(Object));
		expect(view.queryByText('避けたい語を含む本文')).toBeNull();
	});

	/** Oracle: an existing noteDeleted event removes the recommendation; once the final note is gone the shared timeline shows its ordinary empty result. No stream registration count is part of this contract. */
	test('removes a deleted recommendation and shows the no-notes result', async () => {
		const view = mount();
		await view.findByText('本文 recommended');
		globalEvents.emit('noteDeleted', 'recommended');
		await nextTick();
		expect(view.queryByText('本文 recommended')).toBeNull();
		expect(view.getByText('ノートはありません')).toBeTruthy();
		expect(view.getByText('本文 ordinary')).toBeTruthy();
	});

	test.each([false, true])('reaches feedback through the existing ellipsis/contextmenu=%s and preserves normal menu items', async context => {
		const view = mount();
		const { menu } = await openMenu(view, '本文 recommended', context);
		expect(menu).toContainEqual(expect.objectContaining({ text: '詳細' }));
		expect(menu).toContainEqual(expect.objectContaining({ text: '内容をコピー' }));
		const children = await adjustment(menu);
		const less = children.find(item => 'text' in item && item.text === 'この作者を減らす');
		if (!less || !('action' in less)) throw new Error('Author less action is missing');
		await less.action(new MouseEvent('click'));
		expect(request).toHaveBeenCalledWith('hanami-feedback', expect.objectContaining({ snapshotId: 'snapshot1', entryId: 'entry-recommended', target: { kind: 'author', id: 'bob' }, action: 'less', eventId: expect.any(String) }));
		expect(view.queryByRole('button', { name: 'おすすめの調整' })).toBeNull();
	});

	test('does not add recommendation actions to an ordinary note', async () => {
		const view = mount();
		const { menu } = await openMenu(view, '本文 ordinary');
		expect(menu.some(item => 'text' in item && item.text === 'おすすめの調整')).toBe(false);
		expect(menu).toContainEqual(expect.objectContaining({ text: '詳細' }));
	});

	test.each(['quote', 'reply'] as const)('keeps adjustment local to the recommended note across a %s boundary', async kind => {
		const top = note('recommended');
		Object.assign(top, kind === 'quote' ? { renoteId: 'nested', renote: note('nested') } : { replyId: 'nested', reply: note('nested') });
		const view = mount(top);
		const nested = await openMenu(view, '本文 nested');
		expect(nested.menu.some(item => 'text' in item && item.text === 'おすすめの調整')).toBe(false);
		expect(view.getByTestId(`${kind}-boundary`).getAttribute('data-menu-prop')).toBe('false');
		await adjustment((await openMenu(view, '本文 recommended')).menu);
	});

	test('keeps the original menu cleanup and returns focus after closing', async () => {
		let close: (() => void) | undefined;
		popupMenu.mockImplementation(() => new Promise<void>(resolve => { close = resolve; }));
		const view = mount();
		const { article, menu } = await openMenu(view, '本文 recommended');
		const user = menu.find(item => item.type === 'parent' && item.text === 'ユーザー');
		if (user?.type !== 'parent' || typeof user.children !== 'function') throw new Error('Existing user submenu is missing');
		await user.children();
		if (!close) throw new Error('Popup not opened');
		close();
		await nextTick();
		await waitFor(() => expect(userCleanup).toHaveBeenCalledTimes(1));
		expect(document.activeElement).toBe(article.parentElement);
	});
});
