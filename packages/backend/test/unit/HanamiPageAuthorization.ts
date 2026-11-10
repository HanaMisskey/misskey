import { afterEach, describe, expect, jest, test } from '@jest/globals';
import type { MiUser } from '@/models/_.js';
import { HanamiPlatformClient } from '@/core/hanamifeed/HanamiPlatformClient.js';
import { HanamiNoteAccessService } from '@/core/hanamifeed/HanamiNoteAccessService.js';
import { HanamiRecommendationsService } from '@/core/hanamifeed/HanamiRecommendationsService.js';
import { HanamiSearchV2Service } from '@/core/hanamisearch/HanamiSearchV2Service.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { referenceForRows } from '../utils/HanamiNoteReferenceFixture.js';
import { repository, type TestRow } from '../utils/HanamiRecommendationsFixture.js';

const viewer = { id: 'alice', host: null } as MiUser;
type Purpose = 'recommendations' | 'search';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>(complete => { resolve = complete; });
	return { promise, resolve };
}

function fixture(purpose: Purpose, options: { holdValidation?: boolean; replay?: boolean; noSupplement?: boolean } = {}) {
	const author = (id: string): TestRow => ({ id, username: id, host: null, emojis: [], isSuspended: false, isDeleted: false, requireSigninToViewContents: false, makeNotesHiddenBefore: null, makeNotesFollowersOnlyBefore: null });
	const rows: Record<string, TestRow[]> = {
		MiNote: [{
			id: 'a', userId: 'bob', userHost: null, visibility: 'public', text: '返却前に失効する本文', cw: null,
			fileIds: ['attachment-a'], attachedFileTypes: ['image/png'], tags: [], emojis: [], mentions: [], visibleUserIds: [],
			replyId: null, replyUserId: null, replyUserHost: null, renoteId: null, renoteUserId: null, renoteUserHost: null,
			channelId: null, localOnly: false, isNoteInHanaMode: false, hasPoll: false,
			reactions: {}, reactionAndUserPairCache: [], reactionAcceptance: null,
			renoteCount: 0, repliesCount: 0, clippedCount: 0, name: null, url: null, uri: null,
		}],
		MiUser: [author('alice'), author('bob')],
		MiFollowing: [], MiBlocking: [], MiMuting: [], MiRenoteMuting: [],
		MiUserProfile: [{ userId: 'alice', mutedInstances: [] }], MiMeta: [{ id: 'x', blockedHosts: [] }],
		MiHanamiReadBarrier: [],
	};
	const lookup = (name: string) => repository(() => rows[name]);
	const manager = {
		findBy: (target: { name: string }, where: unknown) => lookup(target.name).findBy(where),
		findOneBy: (target: { name: string }, where: unknown) => lookup(target.name).findOneBy(where),
		insert: async (target: { name: string }, row: TestRow) => { rows[target.name].push({ ...row }); },
		delete: async () => {},
	};
	const db = { transaction: async (_isolation: string, work: (value: typeof manager) => Promise<unknown>) => work(manager) };
	const idService = { parse: () => ({ date: new Date(900_000) }), gen: () => 'z' };
	const packUser = async (src: string | TestRow) => ({ ...rows.MiUser.find(user => user.id === (typeof src === 'string' ? src : src.id)) });
	const packFiles = async (ids: string[]) => ids.map(id => ({ id, type: 'image/png', url: `https://files.example.test/${id}` }));
	const entityDependencies: Record<string, unknown> = {
		UserEntityService: { pack: packUser, packMany: async (users: (string | TestRow)[]) => Promise.all(users.map(packUser)) },
		DriveFileEntityService: { packManyByIds: packFiles, packManyByIdsMap: async (ids: string[]) => new Map((await packFiles(ids)).map(file => [file.id, file])) },
		CustomEmojiService: { populateEmojis: () => ({}), prefetchEmojis: async () => {} },
		ReactionService: { convertLegacyReactions: (value: unknown) => value },
		ReactionsBufferingService: { mergeReactions: (value: unknown) => value },
		IdService: idService,
		CacheService: { userFollowingsCache: { fetch: async () => ({}) } },
	};
	const entity = new NoteEntityService(...[
		{ get: (name: string) => entityDependencies[name] }, { enableReactionsBuffering: false },
		lookup('MiUser'), lookup('MiNote'), lookup('MiFollowing'), {}, {}, {}, {},
	] as unknown as ConstructorParameters<typeof NoteEntityService>);
	entity.onModuleInit();
	const packMany = jest.spyOn(entity, 'packMany');
	const access = new HanamiNoteAccessService(...[
		lookup('MiNote'), lookup('MiUser'), lookup('MiFollowing'), lookup('MiBlocking'), lookup('MiMuting'), lookup('MiRenoteMuting'), lookup('MiUserProfile'), lookup('MiMeta'),
		idService, entity, { isBlockedHost: () => false },
	] as unknown as ConstructorParameters<typeof HanamiNoteAccessService>);
	const config = {
		hanamiPlatform: { url: 'http://platform.example.test', keyId: 'test', signingKey: 'synthetic-signing-key', sourceId: 'local-misskey', generation: 7 },
		hanamisearch: { host: 'legacy.example.test', port: '7700', index: 'notes', cursorEncryptionKey: '0123456789abcdef'.repeat(4) },
	};
	const selected = new Map<string, ReturnType<typeof referenceForRows>>();
	const refs = (ids: string[]) => ids.map(id => {
		if (!selected.has(id)) selected.set(id, referenceForRows(id, rows.MiNote, rows.MiUser));
		return selected.get(id)!;
	});
	const page = (ids: string[], nextCursor: string | null) => purpose === 'recommendations'
		? { kind: 'page', page: { items: refs(ids), nextCursor, snapshotId: 'snapshot1', revision: 0, validationToken: 'opaque-validation' } }
		: { hits: ids.map(id => ({ id })), nextCursor };
	const validationStarted = deferred<void>();
	const validationRelease = deferred<void>();
	const supplementStarted = deferred<void>();
	const supplement = deferred<ReturnType<typeof page>>();
	const http = {
		send: jest.fn(async (url: string, requestOptions: { body: string }) => {
			if (url.endsWith('/internal/v1/recommendations/validate')) {
				validationStarted.resolve();
				if (options.holdValidation) await validationRelease.promise;
				return { ok: true, status: 200, json: async () => ({ valid: true }) };
			}
			const { request } = JSON.parse(requestOptions.body) as { request: { cursor?: string } };
			if (purpose === 'recommendations' && url.endsWith('/advance')) {
				supplementStarted.resolve();
				const result = await supplement.promise;
				return { ok: true, status: 200, json: async () => result };
			}
			if (purpose === 'recommendations' && !request.cursor && !options.noSupplement) {
				return { ok: true, status: 200, json: async () => ({ kind: 'authorize', continuation: 'opaque-step', items: refs(['a']) }) };
			}
			if (request.cursor === 'saved') return { ok: true, status: 200, json: async () => page(['a'], 'position1') };
			if (request.cursor) {
				expect(request.cursor).toBe('position1');
				supplementStarted.resolve();
				const result = await supplement.promise;
				return { ok: true, status: 200, json: async () => result };
			}
			return { ok: true, status: 200, json: async () => page(['a'], 'position1') };
		}),
	};
	const client = new HanamiPlatformClient(...[config, db, http] as unknown as ConstructorParameters<typeof HanamiPlatformClient>);
	const recommendationService = new HanamiRecommendationsService(...[client, access] as unknown as ConstructorParameters<typeof HanamiRecommendationsService>);
	const searchService = new HanamiSearchV2Service(...[
		config, lookup('MiNote'), rows.MiMeta[0], entity, {}, {}, http, client, access,
	] as unknown as ConstructorParameters<typeof HanamiSearchV2Service>);
	return {
		rows, packMany, send: http.send, validationStarted: validationStarted.promise, finishValidation: () => validationRelease.resolve(),
		supplementStarted: supplementStarted.promise,
		finishSupplement: () => supplement.resolve(page(purpose === 'recommendations' ? ['a'] : [], null)),
		read: async () => {
			if (purpose === 'search') return searchService.searchNote('本文', viewer, {}, { limit: 2 });
			const result = await recommendationService.getRecommendations(viewer, { limit: options.noSupplement ? 1 : 2, refresh: false, imageFilter: 'any', ...(options.replay ? { cursor: 'saved' } : {}) });
			return { notes: result.items.map(item => item.note), nextCursor: result.nextCursor };
		},
	};
}

afterEach(() => { jest.restoreAllMocks(); });

/**
 * Oracle: Connector ADR-0020 (09e750148bccfc0ae5e37f73d5251fb230d0407a),
 * 「閲覧条件とcanonical投稿」「推薦・snapshot・操作」 and infra timeline §6 require fresh
 * final packing and allow fewer returned notes after revocation. notes/delete calls
 * NoteDeleteService.delete, which deletes the note row; i/update writes the author's
 * makeNotesHiddenBefore through usersRepository.update. Neither change belongs to the
 * viewer relation digest, so the real signed client's post-HTTP check cannot authorize a.
 * At 1,000,000ms, a created at 900,000ms is hidden at the exact absolute cutoff 900 seconds.
 * The second HTTP request starts after a has passed the real Access and NoteEntity pack.
 * Only its empty terminal response is delayed; row state changes before it is released.
 * Repository/HTTP doubles and simple user/file serialization isolate this ordering from
 * PostgreSQL and network delivery; no authorization result or pack call count is mocked.
 */
describe.each(['recommendations', 'search'] as const)('%s final response authorization', purpose => {
	test.each(['deleted', 'author-hidden', 'unchanged'] as const)('returns only currently readable content when a becomes %s during supplementation', async change => {
		jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
		const f = fixture(purpose);
		const result = f.read();
		await Promise.race([
			f.supplementStarted,
			result.then(() => { throw new Error('The response completed before supplementation started'); }),
		]);
		if (change === 'deleted') f.rows.MiNote = [];
		if (change === 'author-hidden') f.rows.MiUser[1].makeNotesHiddenBefore = 900;
		f.finishSupplement();
		const response = await result;
		expect(response.nextCursor).toBeNull();
		if (change === 'unchanged') {
			expect(response.notes.map(note => note.id)).toEqual(['a']);
			expect(response.notes[0].text).toBe('返却前に失効する本文');
			expect(response.notes[0].files).toEqual([{ id: 'attachment-a', type: 'image/png', url: 'https://files.example.test/attachment-a' }]);
		} else {
			expect(response.notes).toEqual([]);
		}
	});
});

/**
 * Oracle: the page contract's validation and authorization decision points retain ADR-0020's
 * current deletion, author visibility, mute and exact time-boundary rules. A note created
 * at 900,000ms with makeNotesHiddenBefore=-100 expires at 1,000,000ms, even if no row changes.
 * A content-version change excludes the already packed body and attachment; it does not
 * authorize a replacement. The signed validation HTTP is held only after the real final pack.
 * Client, Access, NoteEntity and recommendation Service run; repository/HTTP are doubles.
 */
describe.each(['first', 'supplemented', 'replay'] as const)('recommendation validation wait on %s page', acquisition => {
	test.each(['unchanged', 'deleted', 'author-hidden', 'muted', 'time-expired', 'content-changed'] as const)('returns only the original currently readable content after %s', async change => {
		const clock = jest.spyOn(Date, 'now').mockReturnValue(999_999);
		const f = fixture('recommendations', { holdValidation: true, replay: acquisition === 'replay', noSupplement: acquisition === 'first' });
		if (change === 'time-expired') f.rows.MiUser[1].makeNotesHiddenBefore = -100;
		const result = f.read();
		try {
			if (acquisition === 'supplemented') {
				await Promise.race([f.supplementStarted, result.then(() => { throw new Error('Returned before supplementation'); })]);
				f.finishSupplement();
			}
			await Promise.race([f.validationStarted, result.then(() => { throw new Error('Returned before validation'); })]);
			const packsAtValidation = f.packMany.mock.calls.length;
			const requestsAtValidation = f.send.mock.calls.length;
			expect(packsAtValidation).toBeGreaterThan(0);
			if (change === 'deleted') f.rows.MiNote = [];
			if (change === 'author-hidden') f.rows.MiUser[1].makeNotesHiddenBefore = 900;
			if (change === 'muted') f.rows.MiMuting.push({ muterId: 'alice', muteeId: 'bob', expiresAt: null });
			if (change === 'time-expired') clock.mockReturnValue(1_000_000);
			if (change === 'content-changed') Object.assign(f.rows.MiNote[0], { text: '差し替えてはならない本文', fileIds: ['replacement'] });
			f.finishValidation();
			if (change === 'muted') {
				await expect(result).rejects.toMatchObject({ code: 'REFRESH_REQUIRED' });
				return;
			}
			const response = await result;
			expect(response.nextCursor).toBe(acquisition === 'supplemented' ? null : 'position1');
			expect(f.packMany).toHaveBeenCalledTimes(packsAtValidation);
			expect(f.send).toHaveBeenCalledTimes(requestsAtValidation);
			if (change === 'unchanged') {
				expect(response.notes.map(note => note.id)).toEqual(['a']);
				expect(response.notes[0].text).toBe('返却前に失効する本文');
				expect(response.notes[0].files).toEqual([{ id: 'attachment-a', type: 'image/png', url: 'https://files.example.test/attachment-a' }]);
			} else {
				expect(response.notes).toEqual([]);
			}
		} finally {
			f.finishSupplement();
			f.finishValidation();
			await result.catch(() => {});
		}
	});
});
