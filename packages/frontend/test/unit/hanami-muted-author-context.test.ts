/// <reference types="vite/client" />
/** Rendering leaves are isolated; MkNote, its actual MkNoteSub reply, word-mute detection, the hover directive, MkUserPopup and MkFollowButton execute together. */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { defineComponent, h, nextTick, unref } from 'vue';
import type * as Misskey from 'misskey-js';

const { request, popup, viewer, stream } = vi.hoisted(() => ({
	request: vi.fn(), popup: vi.fn(),
	viewer: { id: 'alice', username: 'alice', policies: {}, followingCount: 0, mutedWords: [['非表示にする語']], hardMutedWords: [] },
	stream: { send: vi.fn(), on: vi.fn(), off: vi.fn(), useChannel: () => ({ on: vi.fn(), dispose: vi.fn() }) },
}));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: request, misskeyApiGet: request }));
vi.mock('@/os.js', () => ({ popup, claimZIndex: () => 100 }));
vi.mock('@/i.js', () => ({ $i: viewer, iAmModerator: false }));
vi.mock('@/instance.js', () => ({ instance: {} }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { pollingInterval: 3, defaultFollowWithReplies: false, noteMenu: [] } } }));
vi.mock('@/store.js', () => ({ store: { s: { realtimeMode: true } } }));
vi.mock('@/stream.js', () => ({ useStream: () => stream }));
vi.mock('@/plugin.js', () => ({ getPluginHandlers: () => [] }));
vi.mock('@/utility/touch.js', () => ({ isTouchUsing: false }));
vi.mock('@/utility/haptic.js', () => ({ haptic: vi.fn() }));
vi.mock('@/utility/please-login.js', () => ({ pleaseLogin: async () => true }));
vi.mock('@/utility/show-moved-dialog.js', () => ({ showMovedDialog: vi.fn() }));
vi.mock('@/utility/achievements.js', () => ({ claimAchievement: vi.fn() }));
vi.mock('@/utility/sound.js', () => ({ playMisskeySfx: vi.fn() }));
vi.mock('@/utility/reaction-picker.js', () => ({ reactionPicker: {} }));
vi.mock('@/utility/get-embed-code.js', () => ({ genEmbedCode: vi.fn() }));
vi.mock('@/composables/use-tooltip.js', () => ({ useTooltip: vi.fn() }));
vi.mock('@/router.js', () => ({ mainRouter: { push: vi.fn() } }));
vi.mock('@/cache.js', () => ({ antennasCache: {}, rolesCache: {}, userListsCache: {}, clipsCache: { fetch: async () => [] }, favoritedChannelsCache: {} }));
vi.mock('@/local-storage.js', () => ({ miLocalStorage: { getItem: vi.fn() } }));
vi.mock('@/components/MkReactionsViewer.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkReactionsViewer.details.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkMediaList.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkCwButton.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkPoll.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkUsersTooltip.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkUrlPreview.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkInstanceTicker.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkRippleEffect.vue', () => ({ default: { render: () => null } }));
vi.mock('@/i18n.js', async () => {
	const { default: raw } = await import('../../../../locales/ja-JP.yml?raw');
	const { load } = await import('js-yaml');
	const ts = load(raw) as Record<string, unknown>;
	const format = (value: unknown): unknown => typeof value === 'string'
		? (params: Record<string, unknown>) => value.replace(/\{([^}]+)\}/g, (_, name: string) => String(params[name]))
		: Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, format(item)]));
	return { i18n: { ts, tsx: format(ts) } };
});

import MkNote from '@/components/MkNote.vue';
import I18n from '@/components/global/I18n.vue';
import { userPreviewDirective } from '@/directives/user-preview.js';
import { withHanamiRecommendation } from '@/utility/hanami-recommendation-context.js';

let sourceNumber = 0;
let popupViews: ReturnType<typeof render>[] = [];

function user() {
	return { id: 'bob', username: 'bob', name: null, host: null, avatarUrl: '', avatarDecorations: [], emojis: {}, isFollowing: false, isLocked: false, hasPendingFollowRequestFromYou: false } as unknown as Misskey.entities.UserDetailed;
}

function note(id: string, text: string) {
	return { id, text, userId: 'bob', user: user(), createdAt: '2026-11-08T00:00:00.000Z', cw: null, visibility: 'public', reactionAcceptance: 'nonSensitiveOnly', files: [], fileIds: [], renoteId: null, replyId: null, repliesCount: 0, renoteCount: 0, reactions: {}, reactionCount: 0, reactionEmojis: {}, emojis: {}, myReaction: null } as Misskey.entities.Note;
}

function globalOptions() {
	return {
		components: { I18n },
		stubs: {
			MkA: { props: ['to'], template: '<a :href="to"><slot/></a>' },
			MkUserName: { props: ['user'], template: '<span>{{ user.username }}</span>' },
			Mfm: { props: ['text'], template: '<span>{{ text }}</span>' },
			MkAvatar: true, MkAcct: true, MkTime: true, MkLoading: true,
		},
		directives: { 'user-preview': userPreviewDirective, hotkey: {}, tooltip: {} },
	};
}

async function settle(milliseconds = 0) {
	await nextTick();
	await vi.advanceTimersByTimeAsync(milliseconds);
	await nextTick();
}

function observations() {
	return request.mock.calls.filter(([route]) => route === 'hanami-impressions').flatMap(([, body]) => body.observations);
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-11-08T00:00:00.000Z'));
	popupViews = [];
	let following = false;
	request.mockImplementation(async (route: string) => {
		if (route === 'users/show') return { ...user(), isFollowing: following };
		if (route === 'following/create') { following = true; return user(); }
		if (route === 'hanami-impressions') return undefined;
		throw new Error(`Unexpected API ${route}`);
	});
	popup.mockImplementation((component, props, events) => {
		const view = render(defineComponent({ setup: () => () => h(component, {
			...Object.fromEntries(Object.entries(props).map(([name, value]) => [name, unref(value)])),
			...Object.fromEntries(Object.entries(events).map(([name, handler]) => [`on${name[0].toUpperCase()}${name.slice(1)}`, handler])),
		}) }), { global: globalOptions() });
		popupViews.push(view);
		return { dispose: () => view.unmount() };
	});
});
afterEach(async () => { cleanup(); await settle(1000); vi.clearAllTimers(); vi.useRealTimers(); vi.clearAllMocks(); });

/** Oracle: recommendation provenance belongs to the selected note, even when an embedded reply has the same author. Revealing a soft-muted recommendation keeps its own author actions attributable, while its still-muted reply's author actions cannot become evidence for the outer entry. The existing hover directive opens the real card from the real template's DOM; no boundary marker is added by the fixture. */
describe('soft-muted reply author provenance', () => {
	test.each(['recommended-author', 'muted-reply-author'] as const)('records a successful hover-card follow only from the selected recommended note: %s', async target => {
		const reply = note('nested-reply', '非表示にする語を含む返信');
		const parent = { ...note('recommended', '推薦された親ノート'), replyId: reply.id, reply };
		const recommendation = withHanamiRecommendation(parent, { eventId: `muted-display-${++sourceNumber}`, snapshotId: 'snapshot1', entryId: 'entry1', noteId: 'recommended' });
		const view = render(MkNote, { props: { note: recommendation }, global: globalOptions() });
		await settle();
		expect(view.queryByText('推薦された親ノート')).toBeNull();
		const parentPlaceholder = view.container.querySelector('small');
		if (!parentPlaceholder) throw new Error('The parent was not soft-muted by its embedded reply');
		await fireEvent.click(parentPlaceholder);
		await settle();
		expect(view.getByText('推薦された親ノート')).toBeTruthy();
		expect(view.queryByText('非表示にする語を含む返信')).toBeNull();
		const source = target === 'recommended-author'
			? view.container.querySelector('article header a[href^="/@bob"]')
			: view.container.querySelector('small a[href^="/@bob"]');
		if (!source) throw new Error('The requested real author link did not render');
		await fireEvent.mouseOver(source);
		await settle(500);
		await vi.dynamicImportSettled();
		await settle();
		expect(popup).toHaveBeenCalledTimes(1);
		const follow = popupViews[0].container.querySelector('.ti-plus')?.closest('button');
		if (!follow) throw new Error('The actual hover card did not render its follow button');
		await fireEvent.click(follow);
		await settle(500);
		expect(request).toHaveBeenCalledWith('following/create', { userId: 'bob', withReplies: false });
		if (target === 'recommended-author') expect(observations()).toEqual([expect.objectContaining({ kind: 'action', action: 'follow', snapshotId: 'snapshot1', entryId: 'entry1', noteId: 'recommended' })]);
		else expect(observations()).toEqual([]);
	});
});
