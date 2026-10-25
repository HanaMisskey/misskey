import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { nextTick, ref, unref } from 'vue';
import type * as Misskey from 'misskey-js';
import { preferReactive, preferState } from '../setup.unit.js';
import MkReactionsViewer from '@/components/MkReactionsViewer.vue';
import MkEmoji from '@/components/global/MkEmoji.vue';
import MkCustomEmoji from '@/components/global/MkCustomEmoji.vue';
import MkNoteDetailed from '@/components/MkNoteDetailed.vue';
import MkNotification from '@/components/MkNotification.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import * as os from '@/os.js';

vi.mock('@/i.js', () => {
	const me = { id: 'me', username: 'me', policies: { canSearchNotes: true, canSearchUsers: true } };
	return { $i: me, ensureSignin: () => me, iAmModerator: false, iAmAdmin: false };
});
vi.mock('@/custom-emojis.js', () => ({
	customEmojisMap: new Map([['local', { name: 'local', url: '/local.png' }]]),
}));
vi.mock('@/os.js', () => ({
	confirm: vi.fn(async () => ({ canceled: false })),
	popup: vi.fn(() => ({ dispose: vi.fn() })),
	popupMenu: vi.fn(),
}));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: vi.fn(async () => []), misskeyApiGet: vi.fn() }));
vi.mock('@/utility/sound.js', () => ({ playMisskeySfx: vi.fn() }));

const global = { components: { MkEmoji, MkCustomEmoji }, directives: { ripple: {} } };

const noteGlobal = {
	components: { ...global.components },
	stubs: {
		MkA: { template: '<a><slot/></a>' },
		MkAvatar: true,
		MkAcct: true,
		MkTime: true,
		MkUserName: { props: ['user'], template: '<span>{{ user.username }}</span>' },
		Mfm: true,
		I18n: true,
		MkLoading: true,
		MkError: true,
		MkResult: true,
	},
	directives: { ripple: {}, hotkey: {}, 'user-preview': {}, 'adaptive-bg': {}, appear: {}, tooltip: {} },
};

const author = { id: 'author', username: 'author', host: null, avatarUrl: '/avatar.png' } as Misskey.entities.UserLite;

function note(reactions: Record<string, number>, id = 'original'): Misskey.entities.Note {
	return {
		id, createdAt: '2020-01-01T00:00:00.000Z', text: 'note', cw: null,
		userId: author.id, user: author, visibility: 'public', reactionAcceptance: 'nonSensitiveOnly',
		reactionEmojis: {}, reactions, myReaction: null,
		reactionCount: Object.values(reactions).reduce((sum, count) => sum + count, 0), renoteCount: 0, repliesCount: 0,
	};
}

function viewer(reactions: Record<string, number>, myReaction: string | null = null) {
	return render(MkReactionsViewer, { props: { noteId: 'note', reactions, reactionEmojis: {}, myReaction }, global });
}

function heartButton(view: ReturnType<typeof viewer>) {
	const button = view.getAllByRole('button').find(b => b.textContent?.includes('❤️'));
	if (!button) throw new Error('集約ハートが表示されていない');
	return button;
}

/** ハートは表示用の代理。件数と反応者、取消対象には実際の元リアクションを使う。 */
describe('muted reaction groups', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(misskeyApi).mockResolvedValue([]);
		preferState.animation = false;
		preferState.emojiStyle = 'native';
		preferReactive.mutingEmojis.value = [];
		preferReactive.enableInfiniteScroll = ref(false);
	});

	afterEach(() => cleanup());

	test('設定変更だけでremote反応と実ハートを1行にまとめ、解除すると分離する', async () => {
		const view = viewer({ ':blob@a.test:': 2, ':blob@b.test:': 3, '❤': 4, '😺': 1 });
		preferReactive.mutingEmojis.value = [':blob@a.test:', ':blob@b.test:'];
		await waitFor(() => expect(heartButton(view).textContent).toBe('❤️9'));
		expect(view.getAllByRole('button').map(b => b.textContent)).toEqual(['❤️9', '😺️1']);
		preferReactive.mutingEmojis.value = [];
		await waitFor(() => expect(view.getAllByRole('button')).toHaveLength(4));
	});

	test.each([':local@.:', '❤'])('自分の元反応%sが集約内なら別行を作らず、クリックで取消だけ行う', async (myReaction) => {
		preferReactive.mutingEmojis.value = [':local:'];
		const view = viewer({ ':local@.:': 2, '❤': 4 }, myReaction);
		expect(view.getAllByRole('button')).toHaveLength(1);
		expect(heartButton(view).textContent).toBe('❤️6');
		await fireEvent.click(heartButton(view));
		await waitFor(() => expect(misskeyApi).toHaveBeenCalledWith('notes/reactions/delete', { noteId: 'note' }));
		expect(vi.mocked(misskeyApi).mock.calls.filter(([endpoint]) => endpoint === 'notes/reactions/create')).toEqual([]);
	});

	test.each([null, '😺'])('自分の反応%sが集約外なら実ハートを追加する', async (myReaction) => {
		preferReactive.mutingEmojis.value = [':blob@a.test:'];
		const view = viewer({ ':blob@a.test:': 2, ...(myReaction ? { '😺': 1 } : {}) }, myReaction);
		await fireEvent.click(heartButton(view));
		await waitFor(() => expect(vi.mocked(misskeyApi).mock.calls.some(([endpoint]) => endpoint === 'notes/reactions/create')).toBe(true));
		const writes = vi.mocked(misskeyApi).mock.calls.filter(([endpoint]) => ['notes/reactions/delete', 'notes/reactions/create'].includes(endpoint));
		expect(writes.map(([endpoint]) => endpoint)).toEqual(myReaction
			? ['notes/reactions/delete', 'notes/reactions/create']
			: ['notes/reactions/create']);
		const created = writes.at(-1)![1] as { noteId: string; reaction: string };
		expect(created.noteId).toBe('note');
		expect(['❤', '❤️']).toContain(created.reaction);
		if (myReaction) expect(os.confirm).toHaveBeenCalled();
	});

	test('tooltipは表示ハートを検索値にせず、元群の利用者を取得する', async () => {
		preferReactive.mutingEmojis.value = [':blob@a.test:', ':blob@b.test:'];
		const user = { id: 'reactor', username: 'reactor' } as Misskey.entities.UserLite;
		vi.mocked(misskeyApi).mockResolvedValue([{ id: 'z', createdAt: '2026-01-01', type: ':blob@a.test:', user }]);
		const view = viewer({ ':blob@a.test:': 2, ':blob@b.test:': 3, '❤': 4 });
		await nextTick();
		await fireEvent.mouseOver(heartButton(view));
		await waitFor(() => expect(misskeyApi).toHaveBeenCalledWith('notes/reactions', expect.objectContaining({
			noteId: 'note', types: expect.arrayContaining([':blob@a.test:', ':blob@b.test:', '❤']), limit: 10,
		})));
		expect(os.popup).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ users: [user], count: 9 }), expect.anything());
		expect(view.container.querySelector('img')).toBeNull();
	});

	/** ミュート設定は元キーを解除する。代理ハートを解除しても元画像は戻らないため、文字ラベルで対象を区別する。 */
	test('集約行のメニューから元remote絵文字を選んで解除できる', async () => {
		preferReactive.mutingEmojis.value = [':blob@a.test:', ':blob@b.test:', '😺'];
		const commit = vi.fn((key: string, value: unknown) => { preferReactive[key].value = value; });
		const { prefer } = await import('@/preferences.js');
		Object.defineProperty(prefer, 'commit', { configurable: true, value: commit });
		const view = viewer({ ':blob@a.test:': 2, ':blob@b.test:': 3 });
		await fireEvent.contextMenu(heartButton(view));
		const menus = vi.mocked(os.popupMenu).mock.calls[0][0];

		async function findUnmute(items: typeof menus, unmuteContext = false): Promise<(() => void) | undefined> {
			for (const promise of items) {
				const item = await promise;
				if (!item) continue;
				const label = ('text' in item ? String(unref(item.text)) : '') + ('caption' in item ? String(unref(item.caption)) : '');
				const inUnmute = unmuteContext || label.includes('Unmute');
				if ('children' in item) {
					const children = typeof item.children === 'function' ? await item.children() : item.children;
					const action = await findUnmute(children, inUnmute);
					if (action) return action;
				}
				if ('action' in item && inUnmute && label.includes(':blob@a.test:')) return () => item.action(new PointerEvent('click'));
			}
			return undefined;
		}

		const action = await findUnmute(menus);
		expect(action).toBeTypeOf('function');
		action!();
		await waitFor(() => expect(preferReactive.mutingEmojis.value).toEqual([':blob@b.test:', '😺']));
	});

	/** 元noteと純RNは同じappearNoteの反応を表示し、集約タブから元noteの利用者を取得する。 */
	test.each([false, true])('詳細画面（純RN=%s）は集約タブと元note IDを使う', async (renote) => {
		preferReactive.mutingEmojis.value = [':blob@a.test:', ':blob@b.test:'];
		const original = note({ ':blob@a.test:': 2, ':blob@b.test:': 3, '❤': 4 });
		const displayed = renote ? { ...note({}, 'renote'), text: null, renoteId: original.id, renote: original } : original;
		const view = render(MkNoteDetailed, { props: { note: displayed, initialTab: 'reactions' }, global: noteGlobal });
		const buttons = view.getAllByRole('button').filter(b => b.textContent === '❤️9');
		expect(buttons).toHaveLength(2);
		await fireEvent.click(buttons[1]);
		await waitFor(() => expect(misskeyApi).toHaveBeenCalledWith('notes/reactions', expect.objectContaining({
			noteId: 'original', types: expect.arrayContaining([':blob@a.test:', ':blob@b.test:', '❤']), limit: 10,
		})));
		expect(view.container.querySelector('img[src*="blob"]')).toBeNull();
	});

	/** 分割取得でも全体の最古IDを次ページのcursorにし、chunk間の境界で利用者を飛ばさない。 */
	test('詳細一覧は1000種類を超える群を全体ID順でページングする', async () => {
		const sources = Array.from({ length: 1001 }, (_, i) => `:emoji${i}@a.test:`);
		preferReactive.mutingEmojis.value = sources;
		const rows = Array.from({ length: 20 }, (_, i) => ({
			id: `n${99 - i}`, createdAt: '2020-01-01', type: sources[i % 2 === 0 ? 1000 : 0],
			user: { ...author, id: `user${99 - i}`, username: `user${99 - i}` },
		}));
		vi.mocked(misskeyApi).mockImplementation(async (_endpoint, data) => {
			const query = data as { types?: string[]; untilId?: string; limit: number };
			return rows.filter(row => query.types?.includes(row.type) && (!query.untilId || row.id < query.untilId)).slice(0, query.limit) as never;
		});
		const original = note(Object.fromEntries(sources.map(source => [source, 1])));
		const view = render(MkNoteDetailed, { props: { note: original, initialTab: 'reactions' }, global: noteGlobal });
		const buttons = view.getAllByRole('button').filter(button => button.textContent === '❤️1001');
		expect(buttons).toHaveLength(2);
		await fireEvent.click(buttons[1]);
		await waitFor(() => expect(view.getByText('user90')).toBeTruthy());
		expect(view.queryByText('user89')).toBeNull();
		await fireEvent.click(view.getByRole('button', { name: 'Load more' }));
		await waitFor(() => expect(view.getByText('user80')).toBeTruthy());
		const older = vi.mocked(misskeyApi).mock.calls
			.filter(([endpoint, data]) => endpoint === 'notes/reactions' && data !== undefined && 'untilId' in data)
			.map(([, data]) => data as { types: string[]; untilId: string; limit: number });
		expect(older).toHaveLength(2);
		expect(older.every(query => query.untilId === 'n90' && query.limit === 30 && query.types.length <= 1000)).toBe(true);
		expect(new Set(older.flatMap(query => query.types))).toEqual(new Set(sources));
	});

	/** 通知の単独表示とまとめ表示にもHTTPのVS16なし文字を渡す。 */
	test.each([false, true])('通知（まとめ表示=%s）はHTTP表記を同じミュート設定で隠す', (grouped) => {
		preferReactive.mutingEmojis.value = ['☕️'];
		const base = { id: 'notification', createdAt: '2020-01-01', note: note({ '☕': 1 }) };
		const notification = grouped
			? { ...base, type: 'reaction:grouped' as const, reactions: [{ user: author, reaction: '☕' }] }
			: { ...base, type: 'reaction' as const, user: author, userId: author.id, reaction: '☕' };
		const view = render(MkNotification, { props: { notification }, global: noteGlobal });
		expect(view.getByText('❤️')).toBeTruthy();
		expect(view.container.textContent).not.toContain('☕');
	});

	/** 1000種類のAPI上限で分割しても、別chunkの新しい利用者を取り逃さず、無制限に並列要求しない。 */
	test('大きい集約のtooltipは同時4要求以内で全chunkから上位10人を選ぶ', async () => {
		const sources = [...Array.from({ length: 5000 }, (_, i) => `:emoji${i}@a.test:`), '🏳️‍🌈'];
		preferReactive.mutingEmojis.value = sources;
		const rows = Array.from({ length: 6 }, (_, group) => [9, 8].map(tail => ({
			id: `n${group}${tail}`, createdAt: '2020-01-01', type: sources[group * 1000],
			user: { ...author, id: `user${group}${tail}`, username: `user${group}${tail}` },
		}))).flat();
		const pending: (() => void)[] = [];
		let active = 0;
		let maximum = 0;
		vi.mocked(misskeyApi).mockImplementation(async (_endpoint, data) => {
			const query = data as { types?: string[]; limit: number };
			if (!query.types) return [] as never;
			active++;
			maximum = Math.max(maximum, active);
			await new Promise<void>(resolve => pending.push(resolve));
			active--;
			return rows.filter(r => query.types!.includes(r.type)).sort((a, b) => b.id.localeCompare(a.id)).slice(0, query.limit) as never;
		});
		const view = viewer(Object.fromEntries(sources.map(source => [source, 1])));
		await nextTick();
		await fireEvent.mouseOver(heartButton(view));
		await waitFor(() => expect(misskeyApi).toHaveBeenCalledWith('notes/reactions', expect.objectContaining({ types: expect.any(Array) })));
		for (let i = 0; i < 6; i++) {
			await waitFor(() => expect(pending.length).toBeGreaterThan(0));
			expect(maximum).toBeLessThanOrEqual(4);
			pending.shift()!();
			await nextTick();
		}
		await waitFor(() => expect(os.popup).toHaveBeenCalled());
		const details = vi.mocked(os.popup).mock.calls.at(-1)![1] as { users: Misskey.entities.UserLite[] };
		expect(details.users.map(user => user.id)).toEqual([
			'user59', 'user58', 'user49', 'user48', 'user39', 'user38', 'user29', 'user28', 'user19', 'user18',
		]);
		const queries = vi.mocked(misskeyApi).mock.calls.map(([, data]) => data as { types: string[]; limit: number });
		expect(new Set(queries.flatMap(query => query.types))).toEqual(new Set(sources));
		expect(queries.every(query => query.types.length <= 1000 && query.limit === 10)).toBe(true);
	});
});
