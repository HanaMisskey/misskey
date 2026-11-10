/// <reference types="vite/client" />
/* eslint-disable vue/one-component-per-file -- Rendering leaves are isolated while MkNote, the recommendation component and getNoteMenu stay real. */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { defineComponent, h, nextTick, ref } from 'vue';
import { startHanamiWindow } from '../helpers/hanami-window.js';
import type * as Misskey from 'misskey-js';
import type { MenuItem } from '@/types/menu.js';

const { request, popupMenu, contextMenu, userCleanup, stream, viewer, pageWindow, navigate, share, toast, post, lightboxes } = vi.hoisted(() => ({
	request: vi.fn(), popupMenu: vi.fn(), contextMenu: vi.fn(), userCleanup: vi.fn(), pageWindow: vi.fn(), navigate: vi.fn(), share: vi.fn(), toast: vi.fn(), post: vi.fn(), lightboxes: [] as { next: () => void; zoom: (level: number) => void }[], stream: { send: vi.fn(), on: vi.fn(), off: vi.fn() },
	viewer: { id: 'alice', policies: {}, mutedWords: [] as string[][], hardMutedWords: [] as string[][] },
}));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: request, misskeyApiGet: request }));
vi.mock('@/os.js', () => ({ popupMenu, contextMenu, pageWindow, toast, post, claimZIndex: () => 100, success: vi.fn(), alert: vi.fn() }));
vi.mock('@/i.js', () => ({ $i: viewer, iAmModerator: false }));
vi.mock('@/instance.js', () => ({ instance: {} }));
vi.mock('@/store.js', () => ({ store: { s: { realtimeMode: true } } }));
vi.mock('@/stream.js', () => ({ useStream: () => stream }));
vi.mock('@/preferences.js', async () => {
	const { ref } = await import('vue');
	return { prefer: { s: { pollingInterval: 3, dataSaver: { media: false }, loadRawImages: true, noteMenu: [], useReactionPickerForContextMenu: false, enablePullToRefresh: false }, r: { enableInfiniteScroll: ref(false) } } };
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
vi.mock('@/cache.js', () => ({ clipsCache: { fetch: async () => [] }, favoritedChannelsCache: { fetch: async () => [] } }));
vi.mock('@/utility/hanami-impressions.js', async importOriginal => ({ ...await importOriginal<typeof import('@/utility/hanami-impressions.js')>(), createHanamiImpressionTracker: () => ({ observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn(), complete: vi.fn(), resume: vi.fn() }) }));
vi.mock('@/i18n.js', async () => {
	const { default: locale } = await import('../../../../locales/ja-JP.yml?raw');
	const { load } = await import('js-yaml');
	const ts = load(locale) as Record<string, unknown>;
	const format = (value: unknown): unknown => typeof value === 'string'
		? (params: Record<string, unknown>) => value.replace(/\{([^}]+)\}/g, (_, name: string) => String(params[name]))
		: Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, format(item)]));
	return { i18n: { ts, tsx: format(ts) } };
});
vi.mock('@/components/MkReactionsViewer.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkReactionsViewer.details.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkMediaBanner.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkMediaVideo.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkImgWithBlurhash.vue', () => ({ default: { render: () => null } }));
vi.mock('@/utility/sensitive-file.js', () => ({ shouldHideFileByDefault: () => false, canRevealFile: async () => true }));
vi.mock('photoswipe', () => ({ default: {} }));
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

vi.mock('@/router.js', () => ({ useRouter: () => ({ pushByPath: navigate }) }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/server-context.js', () => ({ serverContext: null, assertServerContext: () => false }));
vi.mock('@/components/MkUserCardMini.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkReactionIcon.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkClipPreview.vue', () => ({ default: { render: () => null } }));

/** PhotoSwipe is the external presentation boundary: clicks on the actual image element open its gallery, and its documented lifecycle events are delivered back to real MkMediaList. */
vi.mock('photoswipe/lightbox', () => ({ default: class {
	callbacks = new Map<string, ((event?: unknown) => void)[]>();
	pswp: { currIndex: number; currSlide: { data: unknown; currZoomLevel: number; zoomLevels: { initial: number } }; element: HTMLElement; isOpen: boolean; ui: { registerElement: () => void } } | undefined;
	constructor(private options: { gallery: HTMLElement; dataSource: unknown[] }) { lightboxes.push(this); }
	on(name: string, callback: (event?: unknown) => void) { this.callbacks.set(name, [...(this.callbacks.get(name) ?? []), callback]); }
	addFilter() {}
	emit(name: string) { for (const callback of this.callbacks.get(name) ?? []) callback({ slide: this.pswp?.currSlide }); }
	click = (event: Event) => {
		const target = (event.target as HTMLElement).closest('.image');
		if (!target) return;
		event.preventDefault();
		this.loadAndOpen([...this.options.gallery.querySelectorAll('.image')].indexOf(target));
	};
	init() { this.options.gallery.addEventListener('click', this.click); }
	loadAndOpen(index: number) {
		this.pswp = { currIndex: index, currSlide: { data: this.options.dataSource[index], currZoomLevel: 1, zoomLevels: { initial: 1 } }, element: document.createElement('div'), isOpen: true, ui: { registerElement() {} } };
		this.emit('change');
		this.emit('afterInit');
	}
	next() {
		if (!this.pswp) throw new Error('Gallery has not opened');
		this.pswp.currIndex++;
		this.pswp.currSlide = { data: this.options.dataSource[this.pswp.currIndex], currZoomLevel: 1, zoomLevels: { initial: 1 } };
		this.emit('change');
	}
	zoom(level: number) {
		if (!this.pswp) throw new Error('Gallery has not opened');
		this.pswp.currSlide.currZoomLevel = level;
		this.emit('zoomPanUpdate');
	}
	destroy() { this.options.gallery.removeEventListener('click', this.click); this.emit('destroy'); }
} }));

import MkNote from '@/components/MkNote.vue';
import MkA from '@/components/global/MkA.vue';
import NotePage from '@/pages/note.vue';
import MkHanamiRecommendations from '@/components/MkHanamiRecommendations.vue';
import MkNotesTimeline from '@/components/MkNotesTimeline.vue';
import MkResult from '@/components/global/MkResult.vue';
import { globalEvents } from '@/events.js';
import { TokenPaginator } from '@/hana/scripts/token-paginator.js';
import { pleaseLogin } from '@/utility/please-login.js';
import { getHanamiNoteContext, withHanamiRecommendation } from '@/utility/hanami-recommendation-context.js';
import { getNoteMenu } from '@/utility/get-note-menu.js';

function note(id: string): Misskey.entities.Note {
	return { id, text: `本文 ${id}`, createdAt: '2026-11-01T00:00:00.000Z', cw: null, userId: 'bob', user: { id: 'bob', name: null, username: 'bob', host: null, avatarUrl: 'https://example.test/avatar.png', avatarBlurhash: null, avatarDecorations: [], emojis: {}, onlineStatus: 'unknown' }, visibility: 'public', reactionAcceptance: 'nonSensitiveOnly', tags: ['猫'], files: [], fileIds: [], renoteId: null, replyId: null, repliesCount: 0, renoteCount: 0, reactions: {}, reactionCount: 0, reactionEmojis: {}, emojis: {}, myReaction: null };
}

function page(top = note('recommended')) {
	return { items: [{ entryId: 'entry-recommended', note: top }], nextCursor: null, snapshotId: 'snapshot1', revision: 0 };
}

function mount(top = note('recommended'), withSearch = false) {
	request.mockImplementation(async (route: string) => {
		if (route === 'notes/hanami-recommendations') return page(top);
		if (route === 'notes/hanamisearch-v2') return { notes: [{ ...note('search-muted'), text: top.text }, note('search-visible')], nextCursor: null };
		if (route === 'notes/state') return { isFavorited: false, isMutedThread: false };
		if (route === 'users/show') return top.user;
		if (route === 'hanami-impressions') return undefined;
		if (route === 'notes/show') return top;
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
	return render(host, { global: { components: { MkResult, MkA }, stubs: { Mfm: text, MkAvatar: true, MkUserName: true, MkAcct: true, MkTime: true, MkButton: true, MkLoading: true, MkSystemIcon: true, MkError: true, MkAd: true, I18n: true }, directives: { hotkey: {}, 'user-preview': {}, appear: {}, tooltip: {} } } });
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
	viewer.id = 'alice';
	viewer.mutedWords = [];
	viewer.hardMutedWords = [];
	window.localStorage.clear();
	lightboxes.length = 0;
	pageWindow.mockReset();
	navigate.mockReset();
	share.mockResolvedValue(undefined);
	vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
	Object.defineProperty(navigator, 'share', { configurable: true, value: share });
	popupMenu.mockImplementation(() => new Promise(() => {}));
	contextMenu.mockImplementation(() => new Promise(() => {}));
	Object.defineProperty(document, 'hidden', { configurable: true, value: false });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); });

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

/** Oracle: reply/quote must carry the selected recommended note's snapshot/entry identity into the composer; nearby ordinary notes and nested reply/quote notes must not inherit it. Opening or closing the composer is not a successful post. The composer outcome is covered by hanami-post-actions.test.ts. */
test.each(['reply', 'quote'] as const)('passes recommendation context through the real %s control only for its own note', async kind => {
	post.mockResolvedValue(undefined);
	const top = note('recommended');
	Object.assign(top, kind === 'quote' ? { renoteId: 'nested', renote: note('nested') } : { replyId: 'nested', reply: note('nested') });
	const view = mount(top);
	for (const id of ['recommended', 'ordinary', 'nested']) {
		vi.mocked(pleaseLogin).mockResolvedValueOnce(true);
		const article = (await view.findByText(`本文 ${id}`)).closest('article');
		if (!article) throw new Error('The real note article did not render');
		const icon = kind === 'reply' ? '.ti-arrow-back-up' : '.ti-repeat';
		const button = [...article.querySelectorAll('footer button')].find(element => element.closest('article') === article && element.querySelector(icon));
		if (!button) throw new Error(`The existing ${kind} control did not render`);
		if (kind === 'reply') await fireEvent.click(button);
		else {
			await fireEvent.mouseDown(button);
			const menu = await Promise.all(popupMenu.mock.calls.at(-1)?.[0] as MenuItem[]);
			const quote = menu.find(item => 'text' in item && item.text === '引用');
			if (!quote || !('action' in quote)) throw new Error('The existing quote action did not open');
			await quote.action(new MouseEvent('click'));
		}
		await nextTick();
		const args = post.mock.calls.at(-1)?.[0];
		const target = args?.[kind === 'reply' ? 'reply' : 'renote'];
		expect(target?.id).toBe(id);
		if (id === 'recommended') {
			const expected = { eventId: expect.any(String), snapshotId: 'snapshot1', entryId: 'entry-recommended', noteId: 'recommended' };
			expect(target?.recommendationEvent).toEqual(expected);
			expect(getHanamiNoteContext(target)).toEqual(expected);
		} else {
			expect(target?.recommendationEvent).toBeUndefined();
			expect(getHanamiNoteContext(target)).toBeUndefined();
		}
	}
	expect(post).toHaveBeenCalledTimes(3);
	expect(request.mock.calls.filter(([route]) => route === 'notes/create' || route === 'hanami-impressions')).toEqual([]);
});

type Interaction = { eventId: string; kind: string; noteId: string; snapshotId: string; entryId: string; occurredAtMs: number; utcOffsetMinutes: number };
const interactions = () => request.mock.calls.filter(([route]) => route === 'hanami-impressions').flatMap(([, body]) => body.observations as Interaction[]);
const settle = async (ms = 0) => { await vi.advanceTimersByTimeAsync(ms); await nextTick(); };

async function renderNotePageAt(path: string, freshModules = false) {
	const target = new URL(path, 'https://example.test');
	const Page = freshModules ? (await import('@/pages/note.vue')).default : NotePage;
	const Anchor = freshModules ? (await import('@/components/global/MkA.vue')).default : MkA;
	return render(Page, { props: { noteId: target.pathname.split('/').at(-1)!, hanami: target.searchParams.get('hanami') ?? undefined }, global: {
		components: { MkA: Anchor, MkResult }, directives: { hotkey: {}, 'user-preview': {}, appear: {}, tooltip: {} }, stubs: {
			Mfm: { props: ['text'], template: '<span>{{ text }}</span>' }, MkAvatar: true, MkUserName: true, MkAcct: true, MkTime: true, MkSystemIcon: true, MkError: true, I18n: true,
			PageWithHeader: { template: '<main><slot/></main>' }, MkButton: true, MkLoading: true, MkRemoteCaution: true,
		},
	} });
}

async function choose(view: ReturnType<typeof mount>, label: string, text = '本文 recommended') {
	const { menu } = await openMenu(view, text);
	const item = menu.find(item => 'text' in item && item.text === label);
	if (!item || !('action' in item)) throw new Error(`Existing note action missing: ${label}`);
	return item.action;
}

/** Oracle: the interaction contract records successful clipboard/share outcomes and actually displayed details. The real recommendation renderer, MkNote, note header, MkA, menu, and note page remain connected. Native clipboard/share, routing windows, network and rendering leaves are boundaries; no observation function is mocked. */
describe('recommendation interaction outcomes from existing note controls', () => {
	beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-08T00:00:00.000Z')); });
	afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

	/** Oracle: a soft-word-mute placeholder is not displayed note content. If the user reveals that placeholder, the first real detail render is the detail-open operation, exactly once even if other controls render again. */
	test('records detail after a soft-muted placeholder is revealed rather than at component mount', async () => {
		const view = mount();
		await settle();
		const path = [...view.container.querySelectorAll('a')].find(element => element.getAttribute('href')?.startsWith('/notes/recommended'))?.getAttribute('href');
		if (!path) throw new Error('Recommended timestamp link was not rendered');
		view.unmount();
		viewer.mutedWords = [['本文']];
		const detail = await renderNotePageAt(path);
		await settle(500);
		expect(detail.queryByText('本文 recommended')).toBeNull();
		expect(detail.container.querySelector('article')).toBeNull();
		expect(interactions()).toEqual([]);
		const placeholder = detail.container.querySelector('._panel');
		if (!placeholder) throw new Error('Soft-word-mute placeholder was not rendered');
		await fireEvent.click(placeholder);
		await settle(500);
		expect(detail.container.querySelector('article')?.textContent).toContain('本文 recommended');
		expect(interactions().filter(record => record.kind === 'detail_open')).toEqual([expect.objectContaining({ noteId: 'recommended', entryId: 'entry-recommended' })]);
		await fireEvent.click(detail.getByText('本文 recommended'));
		await settle(500);
		expect(interactions().filter(record => record.kind === 'detail_open')).toHaveLength(1);
	});

	/** Oracle: copying a note link from its timestamp context menu is the same successful link-copy signal as the note's ellipsis action. The ordinary note alongside it must remain unattributed, and opening a context menu alone is not a copy. */
	test('records successful timestamp-menu copy only for the recommendation that owns the link', async () => {
		const view = mount();
		await settle();
		const timestampCopy = async (noteId: string) => {
			const link = [...view.container.querySelectorAll('a')].find(element => element.getAttribute('href')?.startsWith(`/notes/${noteId}`));
			if (!link) throw new Error(`The real note header has no timestamp link for ${noteId}`);
			await fireEvent.contextMenu(link);
			const menu = await Promise.all(contextMenu.mock.calls.at(-1)?.[0] as MenuItem[]);
			const copy = menu.find(item => 'text' in item && item.text === 'リンクをコピー');
			if (!copy || !('action' in copy)) throw new Error('Timestamp context menu has no copy-link action');
			return copy.action;
		};
		await (await timestampCopy('ordinary'))(new MouseEvent('click'));
		await settle(500);
		expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
		expect(interactions()).toEqual([]);
		const copy = await timestampCopy('recommended');
		await settle(500);
		expect(interactions()).toEqual([]);
		await copy(new MouseEvent('click'));
		await settle(500);
		expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(2);
		expect(interactions()).toEqual([expect.objectContaining({ kind: 'link_copy', noteId: 'recommended', snapshotId: 'snapshot1', entryId: 'entry-recommended' })]);
	});

	/** Oracle: image opening, changing to another attached image and deliberate zoom are separate observable interactions; merely rendering thumbnails or PhotoSwipe's repeated zoom callbacks is not another operation. Image identity comes from the displayed recommendation's actual files. */
	test('records the actual gallery open, zoom and next image without counting initial thumbnails', async () => {
		const top = note('recommended');
		top.files = ['first', 'second'].map(id => ({
			id, type: 'image/png', name: `${id}.png`, url: `https://example.test/${id}.png`, thumbnailUrl: `https://example.test/${id}.png`,
			properties: { width: 600, height: 400 }, isSensitive: false, comment: null, blurhash: null, size: 100, userId: 'bob',
		})) as Misskey.entities.DriveFile[];
		top.fileIds = top.files.map(file => file.id);
		const view = mount(top);
		await settle();
		expect(interactions()).toEqual([]);
		await fireEvent.click(view.getByAltText('first.png'));
		await settle(500);
		expect(interactions().filter(record => record.kind === 'image_open')).toEqual([expect.objectContaining({ kind: 'image_open', noteId: 'recommended', fileId: 'first' })]);
		lightboxes[0].zoom(2);
		await settle(500);
		expect(interactions().filter(record => record.kind === 'image_open')).toHaveLength(2);
		expect(interactions().at(-1)).toMatchObject({ kind: 'image_open', fileId: 'first' });
		lightboxes[0].zoom(2);
		await settle(500);
		expect(interactions().filter(record => record.kind === 'image_open')).toHaveLength(2);
		lightboxes[0].next();
		await settle(500);
		expect(interactions().filter(record => record.kind === 'image_open')).toHaveLength(3);
		expect(interactions().at(-1)).toMatchObject({ kind: 'image_open', fileId: 'second' });
	});

	test.each([['link_copy', 'リンクをコピー'], ['share', '共有']] as const)('records %s only after the native operation resolves', async (kind, label) => {
		let succeed!: () => void;
		const pending = new Promise<void>(resolve => { succeed = resolve; });
		if (kind === 'link_copy') vi.mocked(navigator.clipboard.writeText).mockReturnValue(pending);
		else share.mockReturnValue(pending);
		vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-345);
		const view = mount();
		await settle();
		const action = await choose(view, label);
		const outcome = action(new MouseEvent('click'));
		await settle(500);
		expect(kind === 'link_copy' ? navigator.clipboard.writeText : share).toHaveBeenCalledTimes(1);
		expect(interactions().filter(record => record.kind === kind)).toEqual([]);
		succeed();
		await outcome;
		await settle(500);
		expect(interactions().filter(record => record.kind === kind)).toEqual([expect.objectContaining({
			kind, noteId: 'recommended', snapshotId: 'snapshot1', entryId: 'entry-recommended', eventId: expect.any(String),
			occurredAtMs: Date.parse('2026-11-08T00:00:00.500Z'), utcOffsetMinutes: 345,
		})]);
		expect(request.mock.calls.filter(([route]) => route === 'hanami-impressions').every(([, body]) => body.version === 4)).toBe(true);
	});

	test.each([['link_copy', 'リンクをコピー'], ['share', '共有']] as const)('does not record rejected or cancelled %s and still accepts a subsequent success', async (kind, label) => {
		const rejected = Promise.reject(new DOMException('Native operation cancelled', 'AbortError'));
		void rejected.catch(() => {});
		if (kind === 'link_copy') vi.mocked(navigator.clipboard.writeText).mockReturnValueOnce(rejected);
		else share.mockReturnValueOnce(rejected);
		const view = mount();
		await settle();
		const action = await choose(view, label);
		await Promise.resolve(action(new MouseEvent('click'))).catch(() => {});
		await settle(500);
		expect(interactions().filter(record => record.kind === kind)).toEqual([]);
		await action(new MouseEvent('click'));
		await settle(500);
		expect(interactions().filter(record => record.kind === kind)).toHaveLength(1);
	});

	test('does not attribute an ordinary note copy to the recommendation beside it', async () => {
		const view = mount();
		await settle();
		await (await choose(view, 'リンクをコピー', '本文 ordinary'))(new MouseEvent('click'));
		await settle(500);
		expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
		expect(interactions()).toEqual([]);
		await (await choose(view, 'リンクをコピー'))(new MouseEvent('click'));
		await settle(500);
		expect(interactions()).toEqual([expect.objectContaining({ kind: 'link_copy', noteId: 'recommended' })]);
	});

	test.each(['menu', 'timestamp'] as const)('records detail only after the %s navigation displays the requested note', async source => {
		const view = mount();
		await settle();
		let finish!: (note: Misskey.entities.Note) => void;
		const original = request.getMockImplementation()!;
		request.mockImplementation((route, body) => route === 'notes/show' ? new Promise(resolve => { finish = resolve; }) : original(route, body));
		let detailView: ReturnType<typeof render> | undefined;
		const open = (path: string) => {
			const target = new URL(path, 'https://example.test');
			detailView = render(NotePage, { props: { noteId: target.pathname.split('/').at(-1)!, hanami: target.searchParams.get('hanami') ?? undefined }, global: { components: { MkA, MkResult }, directives: { hotkey: {}, 'user-preview': {}, appear: {}, tooltip: {} }, stubs: {
				Mfm: { props: ['text'], template: '<span>{{ text }}</span>' }, MkAvatar: true, MkUserName: true, MkAcct: true, MkTime: true, MkSystemIcon: true, MkError: true, I18n: true,
				PageWithHeader: { template: '<main><slot/></main>' }, MkButton: true, MkLoading: true, MkRemoteCaution: true,
			} } });
		};
		pageWindow.mockImplementation(open);
		navigate.mockImplementation(open);
		if (source === 'menu') await (await choose(view, '詳細'))(new MouseEvent('click'));
		else {
			const link = [...view.container.querySelectorAll('a')].find(element => element.getAttribute('href')?.startsWith('/notes/recommended'));
			if (!link) throw new Error('The real note header has no timestamp link');
			await fireEvent.click(link);
		}
		await settle(500);
		expect(request).toHaveBeenCalledWith('notes/show', { noteId: 'recommended' });
		expect(interactions().filter(record => record.kind === 'detail_open')).toEqual([]);
		finish(note('recommended'));
		await settle(500);
		expect(detailView?.container.querySelector('article')?.textContent).toContain('本文 recommended');
		expect(interactions().filter(record => record.kind === 'detail_open')).toEqual([expect.objectContaining({ kind: 'detail_open', noteId: 'recommended', snapshotId: 'snapshot1', entryId: 'entry-recommended' })]);
	});
});

/** Oracle: window-api §2 requires actual copy/share Promise callers and explicit window.open paths to preserve the finite observation opportunity. SPA navigation remains in the document. */
describe('native note-menu operations inside a window', () => {
	let number = 0;
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
		vi.spyOn(document, 'hasFocus').mockReturnValue(true);
		Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
		request.mockImplementation(async route => route === 'hanami-impressions' ? undefined : { isFavorited: false, isMutedThread: false });
	});
	afterEach(async () => { window.dispatchEvent(new Event('pagehide')); await settle(500); vi.clearAllTimers(); vi.useRealTimers(); });
	const records = (): Record<string, unknown>[] => request.mock.calls.filter(([route]) => route === 'hanami-impressions').flatMap(([, body]) => body.observations);
	const closes = () => records().filter(record => record.kind === 'window' && record.phase === 'close');

	function source(remote = false) {
		const value = withHanamiRecommendation({ ...note('recommended'), ...(remote ? { uri: 'https://remote.example/notes/recommended' } : {}) }, { eventId: `menu-window-${++number}`, snapshotId: `menu-window-${number}`, entryId: 'entry-a', noteId: 'recommended' });
		startHanamiWindow(value.recommendationEvent);
		return value;
	}

	async function actionFor(value: Misskey.entities.Note, label: string) {
		const { menu } = getNoteMenu({ note: value, translation: ref(null), translating: ref(false) });
		const action = (await Promise.all(menu)).find(item => 'text' in item && item.text === label);
		if (!action || !('action' in action)) throw new Error(`Missing real menu action: ${label}`);
		return action.action;
	}

	test.each(['copy', 'remote-copy', 'share', 'timestamp-copy'] as const)('keeps %s pending and records late success without adding a sealed ordinal', async kind => {
		let succeed!: () => void;
		const pending = new Promise<void>(resolve => { succeed = resolve; });
		if (kind === 'share') share.mockReturnValue(pending);
		else vi.mocked(navigator.clipboard.writeText).mockReturnValue(pending);
		const value = source(kind === 'remote-copy');
		let outcome: unknown;
		if (kind === 'timestamp-copy') {
			const view = render(MkA, { props: { to: `/notes/recommended?hanami=${value.recommendationEvent.eventId}` }, slots: { default: '日時' } });
			await fireEvent.contextMenu(view.getByText('日時'));
			const item = contextMenu.mock.calls.at(-1)?.[0].find((item: MenuItem) => 'text' in item && item.text === 'リンクをコピー');
			outcome = item.action();
		} else outcome = (await actionFor(value, kind === 'share' ? '共有' : kind === 'remote-copy' ? 'リモートのリンクをコピー' : 'リンクをコピー'))(new MouseEvent('click'));
		await settle(60_500);
		expect(closes()).toEqual([expect.objectContaining({ complete: false })]);
		succeed(); await outcome; await settle(500);
		const success = records().find(record => record.kind === (kind === 'share' ? 'share' : 'link_copy'));
		expect(success).toBeDefined();
		expect(success).not.toHaveProperty('windowId');
	});
	test.each(['timestamp-tab', 'remote-tab', 'spa'] as const)('treats %s navigation according to its document boundary', async kind => {
		const value = source(kind === 'remote-tab');
		vi.spyOn(window, 'open').mockReturnValue(null);
		if (kind === 'timestamp-tab') {
			const view = render(MkA, { props: { to: `/notes/recommended?hanami=${value.recommendationEvent.eventId}` }, slots: { default: '日時' } });
			await fireEvent.contextMenu(view.getByText('日時'));
			const item = contextMenu.mock.calls.at(-1)?.[0].find((item: MenuItem) => 'text' in item && item.text === '新しいタブで開く');
			item.action();
		} else await (await actionFor(value, kind === 'spa' ? '詳細' : 'リモートで表示'))(new MouseEvent('click'));
		await settle(60_500);
		expect(closes()).toEqual([expect.objectContaining({ complete: kind === 'spa' })]);
	});
});

/** Oracle: recommendation attribution must survive ordinary same-origin, same-account new-tab/reload navigation. A fresh module graph models the new document's empty JavaScript memory while retaining the browser's native localStorage. The detail renderer and subsequent native controls remain real; this does not emulate a browser process or prove browser storage interoperability. */
describe('recommendation provenance across a fresh document module context', () => {
	beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-08T00:00:00.000Z')); });
	afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

	test('attributes a new-tab detail and its image, copy and share while keeping public URLs plain', async () => {
		const top = note('recommended');
		top.files = [{ id: 'new-tab-image', type: 'image/png', name: 'new-tab-image.png', url: 'https://example.test/new-tab-image.png', thumbnailUrl: 'https://example.test/new-tab-image.png', properties: { width: 600, height: 400 }, isSensitive: false, comment: null, blurhash: null, size: 100, userId: 'bob' }] as Misskey.entities.DriveFile[];
		top.fileIds = ['new-tab-image'];
		const view = mount(top);
		await settle();
		const link = [...view.container.querySelectorAll('a')].find(element => element.getAttribute('href')?.startsWith('/notes/recommended'));
		if (!link) throw new Error('The recommendation timestamp link was not rendered');
		const browserOpen = vi.spyOn(window, 'open').mockReturnValue(null);
		await fireEvent.contextMenu(link);
		const menu = await Promise.all(contextMenu.mock.calls.at(-1)?.[0] as MenuItem[]);
		const newTab = menu.find(item => 'text' in item && item.text === '新しいタブで開く');
		if (!newTab || !('action' in newTab)) throw new Error('The native new-tab action was not rendered');
		await newTab.action(new MouseEvent('click'));
		const path = browserOpen.mock.calls[0]?.[0];
		if (typeof path !== 'string') throw new Error('The new-tab action did not supply a route');
		expect(new URL(path, 'https://example.test').searchParams.get('hanami')).toBeTruthy();
		expect(interactions()).toEqual([]);
		view.unmount();
		vi.resetModules();
		const detail = await renderNotePageAt(path, true);
		await settle(500);
		expect(detail.container.querySelector('article')?.textContent).toContain('本文 recommended');
		expect(interactions()).toEqual([expect.objectContaining({ kind: 'detail_open', noteId: 'recommended', snapshotId: 'snapshot1', entryId: 'entry-recommended' })]);
		await fireEvent.click(detail.getByAltText('new-tab-image.png'));
		await settle(500);
		await (await choose(detail, 'リンクをコピー'))(new MouseEvent('click'));
		await (await choose(detail, '共有'))(new MouseEvent('click'));
		await settle(500);
		expect(interactions().map(record => record.kind)).toEqual(['detail_open', 'image_open', 'link_copy', 'share']);
		expect(interactions().every(record => record.noteId === 'recommended' && record.entryId === 'entry-recommended')).toBe(true);
		const copied = vi.mocked(navigator.clipboard.writeText).mock.calls.at(-1)?.[0];
		expect(copied).toMatch(/\/notes\/recommended$/);
		expect(share.mock.calls.at(-1)?.[0].url).toMatch(/\/notes\/recommended$/);
	});
});

/** Oracle: shared provenance is scoped to the current account and exact note/author, capped at 1000 entries, and expires after 30 minutes from registration. It is optional attribution metadata: unavailable or malformed storage must not break ordinary rendering or manufacture an attributable source. These tests use real localStorage through its production wrapper and fresh module instances. */
describe('bounded account-scoped provenance storage', () => {
	const storageKey = 'hanamiRecommendationContexts';
	const registeredAt = Date.parse('2026-11-08T00:00:00.000Z');
	beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(registeredAt); });
	afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
	const freshContext = async () => { vi.resetModules(); return await import('@/utility/hanami-recommendation-context.js'); };
	const source = (index = 0) => ({
		note: note(`stored-note-${index}`),
		event: { eventId: `stored-source-${index}`, snapshotId: 'stored-snapshot', entryId: `stored-entry-${index}`, noteId: `stored-note-${index}` },
	});

	test('resolves a fresh module only for the same account and exact note or author', async () => {
		const producer = await freshContext();
		const original = source();
		producer.withHanamiRecommendation(original.note, original.event);
		const consumer = await freshContext();
		expect(consumer.hanamiContextForNote(original.event.eventId, original.note.id)).toEqual(original.event);
		expect(consumer.hanamiContextForUser(original.event.eventId, original.note.userId)).toEqual(original.event);
		expect(consumer.hanamiContextForNote(original.event.eventId, 'another-note')).toBeUndefined();
		expect(consumer.hanamiContextForUser(original.event.eventId, 'another-author')).toBeUndefined();
		viewer.id = 'other-account';
		expect(consumer.hanamiContextForNote(original.event.eventId, original.note.id)).toBeUndefined();
		const otherAccount = await freshContext();
		expect(otherAccount.hanamiContextForUser(original.event.eventId, original.note.userId)).toBeUndefined();
		viewer.id = 'alice';
		const originalAccount = await freshContext();
		expect(originalAccount.hanamiContextForNote(original.event.eventId, original.note.id)).toEqual(original.event);
		expect(window.localStorage.getItem(storageKey)).not.toContain(original.note.text);
	});

	test('expires shared provenance thirty minutes after registration without extending it on rehydration', async () => {
		const producer = await freshContext();
		const original = source();
		producer.withHanamiRecommendation(original.note, original.event);
		vi.setSystemTime(registeredAt + 29 * 60_000);
		const consumer = await freshContext();
		expect(consumer.hanamiContextForNote(original.event.eventId, original.note.id)).toEqual(original.event);
		consumer.withHanamiRecommendation(original.note, original.event);
		vi.setSystemTime(registeredAt + 30 * 60_000 + 1);
		expect(consumer.hanamiContextForNote(original.event.eventId, original.note.id)).toBeUndefined();
		const later = await freshContext();
		expect(later.hanamiContextForUser(original.event.eventId, original.note.userId)).toBeUndefined();
	});

	test('shares at most the newest thousand registrations across module instances', async () => {
		const producer = await freshContext();
		const originals = Array.from({ length: 1_001 }, (_, index) => source(index));
		for (const original of originals) {
			producer.withHanamiRecommendation(original.note, original.event);
			vi.setSystemTime(Date.now() + 1);
		}
		const consumer = await freshContext();
		expect(consumer.hanamiContextForNote(originals[0].event.eventId, originals[0].note.id)).toBeUndefined();
		for (const original of originals.slice(1)) expect(consumer.hanamiContextForNote(original.event.eventId, original.note.id)).toEqual(original.event);
	});

	test.each(['malformed JSON', 'invalid record', 'unbounded expiry'] as const)('ignores %s without attributing a forged token or throwing', async corruption => {
		const original = source();
		window.localStorage.setItem(storageKey, corruption === 'malformed JSON' ? '{' : JSON.stringify({ version: 1, sources: [{
			event: corruption === 'invalid record' ? { ...original.event, entryId: 12 } : original.event,
			authorId: 'bob', accountId: 'alice', expiresAt: registeredAt + (corruption === 'unbounded expiry' ? 24 * 60 * 60_000 : 30 * 60_000),
		}] }));
		const consumer = await freshContext();
		expect(() => consumer.hanamiContextForNote(original.event.eventId, original.note.id)).not.toThrow();
		expect(consumer.hanamiContextForNote(original.event.eventId, original.note.id)).toBeUndefined();
	});

	test('keeps unavailable storage optional without inventing shared provenance after a failed write', async () => {
		vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => { throw new DOMException('Storage unavailable', 'SecurityError'); });
		vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => { throw new DOMException('Storage unavailable', 'QuotaExceededError'); });
		const producer = await freshContext();
		const original = source();
		expect(() => producer.withHanamiRecommendation(original.note, original.event)).not.toThrow();
		const consumer = await freshContext();
		expect(() => consumer.hanamiContextForNote(original.event.eventId, original.note.id)).not.toThrow();
		expect(consumer.hanamiContextForNote(original.event.eventId, original.note.id)).toBeUndefined();
	});
});
