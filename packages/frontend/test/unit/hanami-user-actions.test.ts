/// <reference types="vite/client" />
/** Presentation boundaries retain actual follow/report controls and the existing note/user menu actions. */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { defineComponent, h, nextTick, ref } from 'vue';
import { startHanamiWindow } from '../helpers/hanami-window.js';
import type * as Misskey from 'misskey-js';

const { request, confirm, select, popup, errors, preferences, viewer } = vi.hoisted(() => ({
	request: vi.fn(), confirm: vi.fn(), select: vi.fn(), popup: vi.fn(), errors: vi.fn(),
	preferences: { alwaysConfirmFollow: false, defaultFollowWithReplies: false, noteMenu: [] as string[] },
	viewer: { id: 'alice', username: 'alice', policies: {}, followingCount: 0 },
}));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: request }));
vi.mock('@/os.js', () => ({ confirm, select, popupAsyncWithDialog: popup, apiWithDialog: request, alert: vi.fn(), toast: vi.fn(), success: vi.fn(), claimZIndex: () => 100 }));
vi.mock('@/i.js', () => ({ $i: viewer, iAmModerator: false }));
vi.mock('@/instance.js', () => ({ instance: {} }));
vi.mock('@/preferences.js', () => ({ prefer: { s: preferences } }));
vi.mock('@/store.js', () => ({ store: { s: {} } }));
vi.mock('@/stream.js', () => ({ useStream: () => ({ useChannel: () => ({ on: vi.fn(), dispose: vi.fn() }) }) }));
vi.mock('@/utility/please-login.js', () => ({ pleaseLogin: async () => true }));
vi.mock('@/utility/haptic.js', () => ({ haptic: vi.fn() }));
vi.mock('@/utility/achievements.js', () => ({ claimAchievement: vi.fn() }));
vi.mock('@/utility/get-embed-code.js', () => ({ genEmbedCode: vi.fn() }));
vi.mock('@/utility/check-permissions.js', () => ({ notesSearchAvailable: false, canSearchNonLocalNotes: false }));
vi.mock('@/plugin.js', () => ({ getPluginHandlers: () => [] }));
vi.mock('@/router.js', () => ({ mainRouter: { push: vi.fn() } }));
vi.mock('@/cache.js', () => ({ antennasCache: {}, rolesCache: {}, userListsCache: {}, clipsCache: { fetch: async () => [] }, favoritedChannelsCache: {} }));
vi.mock('@/local-storage.js', () => ({ miLocalStorage: { getItem: vi.fn() } }));
vi.mock('@/components/MkRippleEffect.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkWindow.vue', () => ({ default: { template: '<section><slot/><button @click="$emit(\'closed\')">閉じる</button></section>', methods: { close() {} } } }));
vi.mock('@/components/MkButton.vue', () => ({ default: { template: '<button><slot/></button>' } }));
vi.mock('@/components/MkTextarea.vue', () => ({ default: { props: ['modelValue'], emits: ['update:modelValue'], template: '<textarea aria-label="通報理由" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"/>' } }));
vi.mock('@/i18n.js', async () => {
	const { default: raw } = await import('../../../../locales/ja-JP.yml?raw');
	const { load } = await import('js-yaml');
	const ts = load(raw) as Record<string, unknown>;
	const format = (value: unknown): unknown => typeof value === 'string'
		? (params: Record<string, unknown>) => value.replace(/\{([^}]+)\}/g, (_, name: string) => String(params[name]))
		: Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, format(item)]));
	return { i18n: { ts, tsx: format(ts) } };
});
import MkFollowButton from '@/components/MkFollowButton.vue';
import MkUserPopup from '@/components/MkUserPopup.vue';
import { getNoteMenu } from '@/utility/get-note-menu.js';
import { withHanamiRecommendation } from '@/utility/hanami-recommendation-context.js';

type ActionRecord = { kind: string; action: string; noteId: string; snapshotId: string; entryId: string; eventId: string; occurredAtMs: number; utcOffsetMinutes: number };
let sourceNumber = 0;

function user(id = 'bob') {
	return { id, username: id, name: null, host: null, avatarUrl: '', isLocked: false, isFollowing: false, hasPendingFollowRequestFromYou: false, isMuted: false, isBlocking: false, isRenoteMuted: false } as Misskey.entities.UserDetailed;
}

function note() {
	return { id: 'recommended', userId: 'bob', user: user(), visibility: 'public', text: '推薦された投稿', files: [], fileIds: [], renoteId: null, replyId: null, reactionEmojis: {}, emojis: {}, tags: [] } as unknown as Misskey.entities.Note;
}

function recommended() {
	return withHanamiRecommendation(note(), { eventId: `display-${++sourceNumber}`, snapshotId: 'snapshot1', entryId: 'entry1', noteId: 'recommended' });
}

function apiImplementation() {
	const implementation = request.getMockImplementation();
	if (!implementation) throw new Error('API boundary is not initialized');
	return implementation;
}

function observations(): ActionRecord[] {
	return request.mock.calls.filter(([route]) => route === 'hanami-impressions').flatMap(([, body]) => body.observations).filter(record => record.kind === 'action');
}

async function settle(milliseconds = 0) {
	await nextTick();
	await vi.advanceTimersByTimeAsync(milliseconds);
	await nextTick();
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
	return { promise, resolve, reject };
}

function globalOptions() {
	return { config: { errorHandler: errors }, stubs: { MkLoading: true, I18n: true, MkAcct: true, MkAvatar: true, MkUserName: true, MkA: { props: ['to'], template: '<a :href="to"><slot/></a>' } } };
}

/** A menu renderer is a presentation boundary: the product's menu objects, actions, user lookup and report window execute unchanged. */
async function menuFor(source: Misskey.entities.Note, label: string, submenu = true) {
	const { menu } = getNoteMenu({ note: source, translation: ref(null), translating: ref(false) });
	let items = await Promise.all(menu);
	if (submenu) {
		const users = items.find(item => item.type === 'parent' && item.text === 'ユーザー');
		if (!users || users.type !== 'parent') throw new Error('Existing note menu has no user submenu');
		items = await Promise.all(typeof users.children === 'function' ? await users.children() : users.children);
	}
	const item = items.find(item => 'text' in item && item.text === label);
	if (!item || !('action' in item)) throw new Error(`Missing existing action: ${label}`);
	return render(defineComponent({ setup: () => () => h('button', { onClick: item.action }, label) }), { global: globalOptions() });
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-11-08T00:00:00.000Z'));
	vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-345);
	preferences.alwaysConfirmFollow = false;
	confirm.mockResolvedValue({ canceled: false });
	select.mockResolvedValue({ canceled: false, result: 'indefinitely' });
	request.mockImplementation(async (route: string) => {
		if (route === 'hanami-impressions') return undefined;
		if (route === 'users/show') return user();
		if (route === 'notes/state') return { isFavorited: false, isMutedThread: false };
		if (['following/create', 'following/delete', 'mute/create', 'mute/delete', 'blocking/create', 'blocking/delete', 'users/report-abuse'].includes(route)) return undefined;
		throw new Error(`Unexpected API ${route}`);
	});
	popup.mockImplementation(async (component, props, listeners) => {
		const view = render(await component, { props: { ...props, ...Object.fromEntries(Object.entries(listeners).map(([name, handler]) => [`on${name[0].toUpperCase()}${name.slice(1)}`, handler])) }, global: globalOptions() });
		return { dispose: () => view.unmount() };
	});
});
afterEach(async () => { cleanup(); await settle(1000); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.clearAllMocks(); });

/** Oracle: the 2026-11-08 interaction contract requires successful operations on the recommended author, v4 delivery, actual operation time/offset, no follow-request signal, and no attribution from ordinary notes or a different author. API responses are the external boundary; DB verification is tested separately by the backend suite. */
describe('recommended author action controls', () => {
	test('records follow only after the API and confirmed following relationship resolve', async () => {
		const create = deferred<unknown>();
		const relation = deferred<Misskey.entities.UserDetailed>();
		const original = apiImplementation();
		request.mockImplementation((route, body) => route === 'following/create' ? create.promise : route === 'users/show' ? relation.promise : original(route, body));
		const view = render(MkFollowButton, { props: { user: recommended().user as Misskey.entities.UserDetailed, full: true }, global: globalOptions() });
		await fireEvent.click(view.getByRole('button', { name: 'フォロー' }));
		await settle(500);
		expect(request).toHaveBeenCalledWith('following/create', { userId: 'bob', withReplies: false });
		expect(observations()).toEqual([]);
		create.resolve(user());
		await settle(500);
		expect(observations()).toEqual([]);
		relation.resolve({ ...user(), isFollowing: true });
		await settle(500);
		expect(observations()).toEqual([expect.objectContaining({ kind: 'action', action: 'follow', noteId: 'recommended', snapshotId: 'snapshot1', entryId: 'entry1', eventId: expect.any(String), occurredAtMs: Date.parse('2026-11-08T00:00:01.000Z'), utcOffsetMinutes: 345 })]);
		expect(request.mock.calls.filter(([route]) => route === 'hanami-impressions').map(([, body]) => body.version)).toEqual([4]);
	});

	test.each(['request', 'failure', 'cancel', 'ordinary', 'other-author'] as const)('does not record a follow for %s', async outcome => {
		let target = recommended().user as Misskey.entities.UserDetailed;
		if (outcome === 'ordinary') target = user();
		if (outcome === 'other-author') target = { ...target, id: 'charlie' };
		if (outcome === 'cancel') { preferences.alwaysConfirmFollow = true; confirm.mockResolvedValue({ canceled: true }); }
		const original = apiImplementation();
		request.mockImplementation((route, body) => {
			if (route === 'following/create' && outcome === 'failure') return Promise.reject(new Error('Following rejected'));
			if (route === 'users/show') return Promise.resolve({ ...user(target.id), isFollowing: outcome !== 'request', hasPendingFollowRequestFromYou: outcome === 'request' });
			return original(route, body);
		});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const view = render(MkFollowButton, { props: { user: target, full: true }, global: globalOptions() });
		await fireEvent.click(view.getByRole('button', { name: 'フォロー' }));
		await settle(500);
		expect(request.mock.calls.filter(([route]) => route === 'following/create')).toHaveLength(outcome === 'cancel' ? 0 : 1);
		expect(observations()).toEqual([]);
	});

	test.each([['mute', 'ミュート', 'mute/create'], ['block', 'ブロック', 'blocking/create']] as const)('records %s from the existing note user menu only after operation success', async (action, label, endpoint) => {
		const pending = deferred<unknown>();
		const original = apiImplementation();
		request.mockImplementation((route, body) => route === endpoint ? pending.promise : original(route, body));
		const view = await menuFor(recommended(), label);
		await fireEvent.click(view.getByRole('button', { name: label }));
		await settle(500);
		expect(request).toHaveBeenCalledWith(endpoint, expect.objectContaining({ userId: 'bob' }));
		expect(observations()).toEqual([]);
		pending.resolve(undefined);
		await settle(500);
		expect(observations()).toEqual([expect.objectContaining({ kind: 'action', action, noteId: 'recommended', snapshotId: 'snapshot1', entryId: 'entry1', occurredAtMs: Date.parse('2026-11-08T00:00:00.500Z'), utcOffsetMinutes: 345 })]);
	});

	test.each([['mute', 'ミュート', 'mute/create'], ['block', 'ブロック', 'blocking/create']] as const)('does not record cancelled or ordinary-note %s', async (_action, label, endpoint) => {
		select.mockResolvedValue({ canceled: true });
		confirm.mockResolvedValue({ canceled: true });
		const cancelled = await menuFor(recommended(), label);
		await fireEvent.click(cancelled.getByRole('button', { name: label }));
		await settle(500);
		expect(request.mock.calls.filter(([route]) => route === endpoint)).toHaveLength(0);
		expect(observations()).toEqual([]);
		cancelled.unmount();
		select.mockResolvedValue({ canceled: false, result: 'indefinitely' });
		confirm.mockResolvedValue({ canceled: false });
		const ordinary = await menuFor(note(), label);
		await fireEvent.click(ordinary.getByRole('button', { name: label }));
		await settle(500);
		expect(request.mock.calls.filter(([route]) => route === endpoint)).toHaveLength(1);
		expect(observations()).toEqual([]);
	});

	test.each([['mute', 'ミュート', 'mute/create'], ['block', 'ブロック', 'blocking/create']] as const)('does not record failed %s or invent a successful state', async (_action, label, endpoint) => {
		const original = apiImplementation();
		request.mockImplementation((route, body) => route === endpoint ? Promise.reject(new Error('Operation rejected')) : original(route, body));
		const view = await menuFor(recommended(), label);
		await fireEvent.click(view.getByRole('button', { name: label }));
		await settle(500);
		expect(request.mock.calls.filter(([route]) => route === endpoint)).toHaveLength(1);
		expect(observations()).toEqual([]);
	});

	test.each([['ミュート', 'mute/create'], ['ブロック', 'blocking/create']] as const)('does not attribute %s to a different user returned by the note menu lookup', async (label, endpoint) => {
		const original = apiImplementation();
		request.mockImplementation((route, body) => route === 'users/show' ? Promise.resolve(user('charlie')) : original(route, body));
		const view = await menuFor(recommended(), label);
		await fireEvent.click(view.getByRole('button', { name: label }));
		await settle(500);
		expect(request).toHaveBeenCalledWith(endpoint, expect.objectContaining({ userId: 'charlie' }));
		expect(observations()).toEqual([]);
	});

	test.each([['ミュート解除', 'mute/delete'], ['ブロック解除', 'blocking/delete']] as const)('does not turn %s into another action event', async (label, endpoint) => {
		const original = apiImplementation();
		request.mockImplementation((route, body) => route === 'users/show' ? Promise.resolve({ ...user(), isMuted: true, isBlocking: true }) : original(route, body));
		const view = await menuFor(recommended(), label);
		await fireEvent.click(view.getByRole('button', { name: label }));
		await settle(500);
		expect(request).toHaveBeenCalledWith(endpoint, expect.objectContaining({ userId: 'bob' }));
		expect(observations()).toEqual([]);
	});

	test('records report after the real report window submits successfully and excludes the report comment', async () => {
		const pending = deferred<unknown>();
		const original = apiImplementation();
		request.mockImplementation((route, body) => route === 'users/report-abuse' ? pending.promise : original(route, body));
		const view = await menuFor(recommended(), '通報', false);
		await fireEvent.click(view.getByRole('button', { name: '通報' }));
		await vi.dynamicImportSettled();
		await settle();
		const reason = 'This private report text must not enter telemetry';
		await fireEvent.update(view.getByRole('textbox', { name: '通報理由' }), reason);
		await fireEvent.click(view.getByRole('button', { name: '送信' }));
		await settle(500);
		expect(request).toHaveBeenCalledWith('users/report-abuse', { userId: 'bob', comment: reason }, undefined);
		expect(observations()).toEqual([]);
		pending.resolve(undefined);
		await settle(500);
		expect(observations()).toEqual([expect.objectContaining({ kind: 'action', action: 'report', noteId: 'recommended', snapshotId: 'snapshot1', entryId: 'entry1' })]);
		expect(Object.keys(observations()[0]).sort()).toEqual(['action', 'deviceContext', 'entryId', 'eventId', 'kind', 'noteId', 'occurredAtMs', 'snapshotId', 'utcOffsetMinutes']);
	});

	test('closing the report window without sending does not record report', async () => {
		const view = await menuFor(recommended(), '通報', false);
		await fireEvent.click(view.getByRole('button', { name: '通報' }));
		await vi.dynamicImportSettled();
		await settle();
		await fireEvent.click(view.getByRole('button', { name: '閉じる' }));
		await settle(500);
		expect(request.mock.calls.filter(([route]) => route === 'users/report-abuse')).toHaveLength(0);
		expect(observations()).toEqual([]);
	});

	test.each(['ordinary', 'failure'] as const)('does not record an %s report submission', async reason => {
		const original = apiImplementation();
		request.mockImplementation((route, body) => route === 'users/report-abuse' && reason === 'failure' ? Promise.reject(new Error('Report rejected')) : original(route, body));
		const view = await menuFor(reason === 'ordinary' ? note() : recommended(), '通報', false);
		await fireEvent.click(view.getByRole('button', { name: '通報' }));
		await vi.dynamicImportSettled();
		await settle();
		await fireEvent.click(view.getByRole('button', { name: '送信' }));
		await settle(500);
		expect(request.mock.calls.filter(([route]) => route === 'users/report-abuse')).toHaveLength(1);
		expect(observations()).toEqual([]);
	});

	/** Oracle: a hover card's follow belongs to a recommendation only when the source element represents that recommended author. An ordinary card, another author and a nested note are controls for accidental ambient-context inheritance. The real card fetches its author and renders the real follow button. */
	test.each(['recommended', 'ordinary', 'other-author', 'nested-note'] as const)('attributes a hover-card follow only for the matching source: %s', async sourceKind => {
		const recommendation = recommended();
		const article = document.createElement('article');
		const source = document.createElement('a');
		if (sourceKind !== 'ordinary') article.dataset.hanamiRecommendation = recommendation.recommendationEvent.eventId;
		if (sourceKind === 'nested-note') {
			const nested = document.createElement('article');
			nested.dataset.hanamiRecommendation = '';
			nested.append(source);
			article.append(nested);
		} else article.append(source);
		let following = false;
		const targetId = sourceKind === 'other-author' ? 'charlie' : 'bob';
		const original = apiImplementation();
		request.mockImplementation((route, body) => {
			if (route === 'users/show') return Promise.resolve({ ...user(targetId), isFollowing: following });
			if (route === 'following/create') { following = true; return Promise.resolve(user(targetId)); }
			return original(route, body);
		});
		const view = render(MkUserPopup, { props: { showing: true, q: targetId, source }, global: globalOptions() });
		await settle();
		const follow = view.container.querySelector('.ti-plus')?.closest('button');
		if (!follow) throw new Error('The actual hover card did not render its follow button');
		await fireEvent.click(follow);
		await settle(500);
		expect(request).toHaveBeenCalledWith('following/create', { userId: targetId, withReplies: false });
		if (sourceKind === 'recommended') expect(observations()).toEqual([expect.objectContaining({ kind: 'action', action: 'follow', snapshotId: 'snapshot1', entryId: 'entry1', noteId: 'recommended' })]);
		else expect(observations()).toEqual([]);
	});
});

/** Oracle: contract §6/addendum §4 keep API and relationship confirmation pending, but form editing and successful mute, block or report operations do not invalidate a window. */
describe('author controls inside observation windows', () => {
	beforeEach(() => {
		vi.spyOn(document, 'hasFocus').mockReturnValue(true);
		Object.defineProperty(document, 'hidden', { configurable: true, value: false });
		Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
	});
	afterEach(async () => { window.dispatchEvent(new Event('pagehide')); await settle(500); });
	const source = () => withHanamiRecommendation(note(), { eventId: `window-user-${++sourceNumber}`, snapshotId: `window-user-${sourceNumber}`, entryId: 'entry1', noteId: 'recommended' });
	const allRecords = (): Record<string, unknown>[] => request.mock.calls.filter(([route]) => route === 'hanami-impressions').flatMap(([, body]) => body.observations);
	const closes = () => allRecords().filter(record => record.kind === 'window' && record.phase === 'close');

	test('keeps follow pending through users/show and preserves late confirmed success outside the window', async () => {
		const pending = deferred<Misskey.entities.UserDetailed>();
		const original = apiImplementation();
		request.mockImplementation((route, body) => route === 'users/show' ? pending.promise : original(route, body));
		const recommendation = source();
		startHanamiWindow(recommendation.recommendationEvent);
		const view = render(MkFollowButton, { props: { user: recommendation.user as Misskey.entities.UserDetailed, full: true }, global: globalOptions() });
		await fireEvent.click(view.getByRole('button', { name: 'フォロー' }));
		await settle(60_500);
		expect(closes()).toEqual([expect.objectContaining({ complete: false })]);
		pending.resolve({ ...user(), isFollowing: true });
		await settle(500);
		expect(observations()).toEqual([expect.objectContaining({ action: 'follow' })]);
		expect(observations()[0]).not.toHaveProperty('windowId');
	});

	test('an unanswered follow confirmation never starts an API operation', async () => {
		const answer = deferred<{ canceled: boolean }>();
		confirm.mockReturnValue(answer.promise);
		preferences.alwaysConfirmFollow = true;
		const recommendation = source();
		startHanamiWindow(recommendation.recommendationEvent);
		const view = render(MkFollowButton, { props: { user: recommendation.user as Misskey.entities.UserDetailed, full: true }, global: globalOptions() });
		await fireEvent.click(view.getByRole('button', { name: 'フォロー' }));
		await settle(60_500);
		expect(closes()).toEqual([expect.objectContaining({ complete: true, pendingActions: 0 })]);
		expect(request.mock.calls.filter(([route]) => route === 'following/create')).toEqual([]);
		answer.resolve({ canceled: true });
		await settle();
	});

	test.each([['mute', 'ミュート', 'mute/create'], ['block', 'ブロック', 'blocking/create']] as const)('successful %s removes its card without interrupting observation', async (action, label, endpoint) => {
		const recommendation = source();
		startHanamiWindow(recommendation.recommendationEvent);
		const view = await menuFor(recommendation, label);
		await fireEvent.click(view.getByRole('button', { name: label }));
		await settle(500);
		expect(request).toHaveBeenCalledWith(endpoint, expect.objectContaining({ userId: 'bob' }));
		view.unmount();
		await settle(60_000);
		expect(closes()).toEqual([expect.objectContaining({ complete: true, pendingActions: 0 })]);
		expect(observations()).toEqual([expect.objectContaining({ action, windowId: expect.any(String) })]);
	});

	test.each(['editing', 'pending', 'failed', 'success'] as const)('measures report %s without sending its private comment', async state => {
		const pending = deferred<unknown>();
		const original = apiImplementation();
		request.mockImplementation((route, body) => route === 'users/report-abuse' ? pending.promise : original(route, body));
		const recommendation = source();
		startHanamiWindow(recommendation.recommendationEvent);
		const view = await menuFor(recommendation, '通報', false);
		await fireEvent.click(view.getByRole('button', { name: '通報' }));
		await vi.dynamicImportSettled();
		await settle();
		await fireEvent.update(view.getByRole('textbox', { name: '通報理由' }), 'PRIVATE_REPORT_COMMENT');
		if (state !== 'editing') await fireEvent.click(view.getByRole('button', { name: '送信' }));
		if (state === 'success') pending.resolve(undefined);
		if (state === 'failed') pending.reject(new Error('Report outcome unknown'));
		await settle(60_500);
		expect(closes()).toEqual([expect.objectContaining({ complete: state === 'editing' || state === 'success' })]);
		expect(observations()).toHaveLength(state === 'success' ? 1 : 0);
		expect(JSON.stringify(allRecords())).not.toContain('PRIVATE_REPORT_COMMENT');
		if (state === 'pending') { pending.resolve(undefined); await settle(500); expect(observations()[0]).not.toHaveProperty('windowId'); }
	});
});
