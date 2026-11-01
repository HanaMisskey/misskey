import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { Test } from '@nestjs/testing';
import type { MiUser } from '@/models/_.js';
import { HanamiPlatformError } from '@/core/hanamifeed/HanamiPlatformClient.js';
import { HanamiNoteAccessService } from '@/core/hanamifeed/HanamiNoteAccessService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { IdService } from '@/core/IdService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { DI } from '@/di-symbols.js';
import { referenceForRows } from '../utils/HanamiNoteReferenceFixture.js';
import { repository, type TestRow } from '../utils/HanamiRecommendationsFixture.js';
import type { TestingModule } from '@nestjs/testing';

const now = 1_000_000;
const viewer = { id: 'alice', host: null } as MiUser;
const modules: TestingModule[] = [];

function author(id: string, extra: TestRow = {}): TestRow {
	return { id, username: id, host: null, isSuspended: false, isDeleted: false, isInHanaMode: false, requireSigninToViewContents: false, makeNotesHiddenBefore: null, makeNotesFollowersOnlyBefore: null, ...extra };
}

function note(id: string, extra: TestRow = {}): TestRow {
	return {
		id, userId: 'bob', userHost: null, visibility: 'public', text: '公開本文', cw: null,
		fileIds: [], attachedFileTypes: [], tags: [], emojis: [], mentions: [], visibleUserIds: [],
		replyId: null, replyUserId: null, replyUserHost: null, renoteId: null, renoteUserId: null, renoteUserHost: null,
		channelId: null, localOnly: false, isNoteInHanaMode: false, hasPoll: false,
		reactions: {}, reactionAndUserPairCache: [], reactionAcceptance: null,
		renoteCount: 0, repliesCount: 0, clippedCount: 0, name: null, url: null, uri: null,
		...extra,
	};
}

async function fixture(initialNotes: TestRow[] = [note('note1')]) {
	const state = {
		unpackedFiles: new Set<string>(), notes: initialNotes, users: [author('alice'), author('bob'), author('carol')],
		followings: [] as TestRow[], blockings: [] as TestRow[], mutings: [] as TestRow[], renoteMutings: [] as TestRow[],
		profiles: [{ userId: 'alice', mutedInstances: [] }] as TestRow[], metas: [{ id: 'x', blockedHosts: [] }] as TestRow[],
	};
	const repos = {
		notes: repository(() => state.notes), users: repository(() => state.users),
		followings: repository(() => state.followings), blockings: repository(() => state.blockings),
		mutings: repository(() => state.mutings), renoteMutings: repository(() => state.renoteMutings),
		profiles: repository(() => state.profiles), metas: repository(() => state.metas),
	};
	const createdAt = new Map(initialNotes.map(row => [String(row.id), 900_000]));
	const idService = { parse: (id: string) => ({ date: new Date(createdAt.get(id) ?? 900_000) }) };
	const entityDependencies: Record<string, unknown> = {
		UserEntityService: { pack: async (src: string | TestRow) => ({ ...state.users.find(user => user.id === (typeof src === 'string' ? src : src.id)) }) },
		DriveFileEntityService: { packManyByIds: async (ids: string[]) => ids.filter(id => !state.unpackedFiles.has(id)).map(id => ({ id, type: 'image/png', url: `https://files.example.test/${id}` })) },
		CustomEmojiService: { populateEmojis: () => ({}) },
		ReactionService: { convertLegacyReactions: (value: unknown) => value },
		ReactionsBufferingService: { mergeReactions: (value: unknown) => value },
		IdService: idService,
		CacheService: { userFollowingsCache: { fetch: async (id: string) => Object.fromEntries(state.followings.filter(row => row.followerId === id).map(row => [row.followeeId, {}])) } },
	};
	const actualPack = new NoteEntityService(...[
		{ get: (name: string) => entityDependencies[name] }, { enableReactionsBuffering: false },
		repos.users, repos.notes, repos.followings, {}, {}, {}, repository(() => [{ id: 'channel1', name: 'test channel', color: '#000000', isSensitive: false, allowRenoteToExternal: false, userId: 'bob' }]),
	] as unknown as ConstructorParameters<typeof NoteEntityService>);
	actualPack.onModuleInit();
	let afterPack: () => void = () => {};
	const packMany = jest.spyOn(actualPack, 'packMany').mockImplementation(async (notes, me) => {
		const packed = await Promise.all(notes.map(row => actualPack.pack(row, me, { detail: true, withReactionAndUserPairCache: true })));
		afterPack();
		return packed;
	});
	const app = await Test.createTestingModule({
		providers: [
			HanamiNoteAccessService,
			{ provide: DI.notesRepository, useValue: repos.notes }, { provide: DI.usersRepository, useValue: repos.users },
			{ provide: DI.followingsRepository, useValue: repos.followings }, { provide: DI.blockingsRepository, useValue: repos.blockings },
			{ provide: DI.mutingsRepository, useValue: repos.mutings }, { provide: DI.renoteMutingsRepository, useValue: repos.renoteMutings },
			{ provide: DI.userProfilesRepository, useValue: repos.profiles }, { provide: DI.metasRepository, useValue: repos.metas },
			{ provide: IdService, useValue: idService }, { provide: NoteEntityService, useValue: actualPack },
			{ provide: UtilityService, useValue: { isBlockedHost: (hosts: string[], host: string | null) => host != null && hosts.some(blocked => host === blocked || host.endsWith(`.${blocked}`)) } },
		],
	}).compile();
	modules.push(app);
	return { service: app.get(HanamiNoteAccessService), state, createdAt, packMany, refs: (ids: string[], expires = Number.MAX_SAFE_INTEGER) => ids.map(id => referenceForRows(id, state.notes, state.users, expires)), afterPack: (fn: () => void) => { afterPack = fn; } };
}

afterEach(async () => {
	jest.restoreAllMocks();
	await Promise.all(modules.splice(0).map(app => app.close()));
});

/** Oracle: the pack boundary is root detail=true, reply detail=false, and renote detail=true. Only serialized content is constrained, and private nested context is retained when it is currently visible. */
describe('serialized recommendation context', () => {
	test.each(['followers', 'specified'] as const)('retains currently visible %s quoted context and its packed attachment', async visibility => {
		const f = await fixture([note('root', { renoteId: 'nested', renoteUserId: 'carol' }), note('nested', { userId: 'carol', visibility, visibleUserIds: ['alice'], fileIds: ['private-image'], attachedFileTypes: ['image/png'] })]);
		f.state.followings.push({ followerId: 'alice', followeeId: 'carol' });
		const result = await f.service.packReferences(f.refs(['root']), viewer);
		expect(result.map((row: { id: string }) => row.id)).toEqual(['root']);
		expect(result[0].renote?.visibility).toBe(visibility);
		expect(result[0].renote?.files.map((file: { id: string }) => file.id)).toEqual(['private-image']);
	});

	test.each(['inaccessible', 'missing', 'muted'] as const)('excludes a root with %s serialized context', async condition => {
		const f = await fixture([note('root', { renoteId: 'nested', renoteUserId: 'carol' }), ...(condition === 'missing' ? [] : [note('nested', { userId: 'carol', visibility: condition === 'inaccessible' ? 'specified' : 'public', visibleUserIds: ['bob'] })])]);
		if (condition === 'muted') f.state.mutings.push({ muterId: 'alice', muteeId: 'carol', expiresAt: null });
		expect(await f.service.packReferences(f.refs(['root']), viewer)).toEqual([]);
	});

	test('ignores an inaccessible grandparent hidden behind a detail=false reply', async () => {
		const f = await fixture([
			note('root', { replyId: 'reply', replyUserId: 'carol' }),
			note('reply', { userId: 'carol', replyId: 'grandparent', replyUserId: 'bob' }),
			note('grandparent', { visibility: 'specified', visibleUserIds: ['bob'] }),
		]);
		const result = await f.service.packReferences(f.refs(['root']), viewer);
		expect(result.map((row: { id: string }) => row.id)).toEqual(['root']);
		expect(result[0].reply?.id).toBe('reply');
		expect(result[0].reply).not.toHaveProperty('reply');
	});

	test('does not use a raw replyUserId to authorize a followers note serialized without its reply', async () => {
		const f = await fixture([
			note('root', { replyId: 'reply', replyUserId: 'carol' }),
			note('reply', { userId: 'carol', visibility: 'followers', replyId: 'grandparent', replyUserId: 'alice' }),
			note('grandparent', { userId: 'alice' }),
		]);
		expect(await f.service.packReferences(f.refs(['root']), viewer)).toEqual([]);
	});

	test.each([8, 9])('handles %i renote edges at the bounded serialization limit', async depth => {
		const rows = Array.from({ length: depth + 1 }, (_, index) => note(`n${index}`, index < depth ? { renoteId: `n${index + 1}`, renoteUserId: 'bob' } : {}));
		const f = await fixture(rows);
		if (depth === 8) expect((await f.service.packReferences(f.refs(['n0']), viewer)).map((row: { id: string }) => row.id)).toEqual(['n0']);
		else await expect(f.service.packReferences(f.refs(['n0']), viewer)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
	});

	test('rejects a renote cycle as unavailable before recursively packing it', async () => {
		const f = await fixture([note('a', { renoteId: 'b', renoteUserId: 'bob' }), note('b', { renoteId: 'a', renoteUserId: 'bob' })]);
		await expect(f.service.packReferences(f.refs(['a']), viewer)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
		expect(f.packMany).not.toHaveBeenCalled();
	});
});

/** Oracle: infra/hanami-search-access-contract.md and ADR-0020 retain search visibility exceptions and the existing relation/host exclusion scope. The reference authorization path must not change the established search scope. */
describe('current authenticated search access', () => {
	test.each<[string, TestRow, boolean, string[]]>([
		['home', { visibility: 'home' }, false, ['note1']],
		['specified recipient', { visibility: 'specified', visibleUserIds: ['alice'] }, false, ['note1']],
		['specified mention only', { visibility: 'specified', visibleUserIds: ['carol'], mentions: ['alice'] }, false, []],
		['followers', { visibility: 'followers' }, true, ['note1']],
		['unfollowed', { visibility: 'followers' }, false, []],
		['followers mention', { visibility: 'followers', mentions: ['alice'] }, false, ['note1']],
		['channel', { channelId: 'channel1' }, false, ['note1']],
		['hanaMode', { isNoteInHanaMode: true }, false, ['note1']],
	])('handles %s according to search visibility', async (_name, extra, following, expected) => {
		const f = await fixture([note('note1', extra)]);
		if (following) f.state.followings.push({ followerId: 'alice', followeeId: 'bob' });
		expect((await f.service.packSearchResults(['note1'], viewer, {})).map((row: { id: string }) => row.id)).toEqual([...expected]);
	});

	test('allows outgoing-only block and renote mute, but removes the same candidate after incoming block', async () => {
		const f = await fixture();
		f.state.blockings.push({ blockerId: 'alice', blockeeId: 'bob' });
		f.state.renoteMutings.push({ muterId: 'alice', muteeId: 'bob' });
		expect((await f.service.packSearchResults(['note1'], viewer, {})).map((row: { id: string }) => row.id)).toEqual(['note1']);
		f.state.blockings.push({ blockerId: 'bob', blockeeId: 'alice' });
		expect(await f.service.packSearchResults(['note1'], viewer, {})).toEqual([]);
	});

	test('does not extend search host exclusion beyond the existing direct related-host scope', async () => {
		const f = await fixture([
			note('root', { renoteId: 'direct', renoteUserId: 'bob' }),
			note('direct', { renoteId: 'deep', renoteUserId: 'carol', renoteUserHost: 'blocked.example' }),
			note('deep', { userId: 'carol', userHost: 'blocked.example' }),
		]);
		f.state.users[2].host = 'blocked.example';
		f.state.metas[0].blockedHosts = ['blocked.example'];
		expect((await f.service.packSearchResults(['root'], viewer, {})).map((row: { id: string }) => row.id)).toEqual(['root']);
		expect(await f.service.packReferences(f.refs(['root']), viewer)).toEqual([]);
	});

	test('applies explicit search filters together with access, preserving remote recipients', async () => {
		const f = await fixture([note('remote', { userHost: 'remote.example', visibility: 'specified', visibleUserIds: ['alice'], fileIds: ['audio'], attachedFileTypes: ['audio/ogg'] })]);
		f.state.users[1].host = 'remote.example';
		expect((await f.service.packSearchResults(['remote'], viewer, { userId: 'bob', host: 'remote.example', onlyWithFiles: true })).map((row: { id: string }) => row.id)).toEqual(['remote']);
		expect(await f.service.packSearchResults(['remote'], viewer, { host: '.' })).toEqual([]);
	});
});

/** Oracle: ADR-0023's shared wire vector fixes null/false, non-ASCII UTF-8, decomposed Unicode and array order. A matching digest authorizes the original graph; a different digest cannot be ignored. */
describe('source state reference guards', () => {
	test('accepts the same fixed content digest as the Python source projection', async () => {
		const vector = JSON.parse(readFileSync(new URL('../fixtures/hanami-note-state-v1.json', import.meta.url), 'utf8'));
		const f = await fixture([note(vector.note.id, vector.note)]);
		f.state.users.push(author(vector.author.id, vector.author));
		const reference = { entryId: 'fixed-entry', noteId: vector.note.id, guard: { contentDigest: 'bcc40786663e2ff88cc1aafa401a00dd31ef0a83d15f89685623641c01c94682', validUntilMs: Number.MAX_SAFE_INTEGER } };
		const result = await f.service.packReferences([reference], viewer);
		expect(result.map((row: { id: string }) => row.id)).toEqual([vector.note.id]);
		expect(result[0].text).toBe('猫😀と e\u0301\n"引用"');
		await expect(f.service.packReferences([{ ...reference, guard: { ...reference.guard, contentDigest: '0'.repeat(64) } }], viewer)).resolves.toEqual([]);
	});

	/** These are already selected external references. Misskey compares their source state and current viewing permission; selection belongs to the internal service. */
	test.each([
		{ visibility: 'home' }, { visibility: 'specified', visibleUserIds: ['alice'] },
		{ channelId: 'channel1' }, { isNoteInHanaMode: true },
		{ fileIds: ['audio'], attachedFileTypes: ['audio/ogg'] },
	])('packs a currently readable matching source reference %p without a local candidate rule', async change => {
		const f = await fixture([note('note1', change)]);
		expect((await f.service.packReferences(f.refs(['note1']), viewer)).map((row: { id: string }) => row.id)).toEqual(['note1']);
	});

	test.each(['before-pack', 'during-pack', 'during-validation'] as const)('rejects source changes %s without packing a replacement body', async phase => {
		const f = await fixture([note('note1', { fileIds: ['original'], attachedFileTypes: ['audio/ogg'] })]);
		const refs = f.refs(['note1']);
		const change = () => Object.assign(f.state.notes[0], { text: '置換本文', fileIds: ['replacement'] });
		if (phase === 'before-pack') change();
		if (phase === 'during-pack') f.afterPack(change);
		expect(await f.service.packReferences(refs, viewer, phase === 'during-validation' ? async () => { change(); } : undefined)).toEqual([]);
		expect(f.packMany).toHaveBeenCalledTimes(phase === 'before-pack' ? 0 : 1);
	});

	test.each([
		{ visibility: 'home' }, { channelId: 'channel1' }, { isNoteInHanaMode: true },
		{ fileIds: [] }, { attachedFileTypes: ['image/png'] },
	])('rejects changed source fields %p after remote selection but before the first pack', async change => {
		const f = await fixture([note('note1', { fileIds: ['original'], attachedFileTypes: ['audio/ogg'] })]);
		const refs = f.refs(['note1']);
		Object.assign(f.state.notes[0], change);
		expect(await f.service.packReferences(refs, viewer)).toEqual([]);
		expect(f.packMany).not.toHaveBeenCalled();
	});

	test('rejects an expired generic guard at equality without interpreting its reason', async () => {
		const clock = jest.spyOn(Date, 'now').mockReturnValue(now - 1);
		const f = await fixture();
		const refs = f.refs(['note1'], now);
		expect((await f.service.packReferences(refs, viewer)).map((row: { id: string }) => row.id)).toEqual(['note1']);
		expect(await f.service.packReferences(refs, viewer, async () => { clock.mockReturnValue(now); })).toEqual([]);
	});

	test('rejects changed serialized context while ignoring ancestors absent from the packed reply', async () => {
		const f = await fixture([note('root', { replyId: 'reply', replyUserId: 'carol' }), note('reply', { userId: 'carol', replyId: 'ancestor', replyUserId: 'bob' }), note('ancestor')]);
		const refs = f.refs(['root']);
		f.state.notes[2].text = '表示されない祖先の変更';
		expect((await f.service.packReferences(refs, viewer)).map((row: { id: string }) => row.id)).toEqual(['root']);
		f.state.notes[1].text = '表示される返信の変更';
		expect(await f.service.packReferences(refs, viewer)).toEqual([]);
	});
});

/** Oracle: the final DB check retains current visibility, deletion, local-viewer validity and bilateral block/mute/host constraints across every serialized author. External source consistency cannot replace authorization. */
describe('current reference authorization', () => {
	test('preserves reference order despite repository order', async () => {
		const f = await fixture([note('z'), note('m'), note('a')]);
		expect((await f.service.packReferences(f.refs(['a', 'z', 'm']), viewer)).map((row: { id: string }) => row.id)).toEqual(['a', 'z', 'm']);
	});

	test.each(['incoming', 'outgoing', 'mute', 'suspended', 'deleted-author', 'blocked-host', 'muted-host'] as const)('excludes a matching reference for a current %s author', async condition => {
		const f = await fixture();
		if (condition === 'incoming') f.state.blockings.push({ blockerId: 'bob', blockeeId: 'alice' });
		if (condition === 'outgoing') f.state.blockings.push({ blockerId: 'alice', blockeeId: 'bob' });
		if (condition === 'mute') f.state.mutings.push({ muterId: 'alice', muteeId: 'bob', expiresAt: null });
		if (condition === 'suspended') f.state.users[1].isSuspended = true;
		if (condition === 'deleted-author') f.state.users[1].isDeleted = true;
		if (condition === 'blocked-host' || condition === 'muted-host') {
			f.state.users[1].host = 'remote.example';
			f.state.notes[0].userHost = 'remote.example';
			if (condition === 'blocked-host') f.state.metas[0].blockedHosts = ['remote.example'];
			else f.state.profiles[0].mutedInstances = ['remote.example'];
		}
		expect(await f.service.packReferences(f.refs(['note1']), viewer)).toEqual([]);
		expect(f.packMany).not.toHaveBeenCalled();
	});

	test.each(['deleted', 'private', 'hidden', 'muted', 'renote-muted'] as const)('rechecks %s after final validation', async change => {
		const f = await fixture();
		const refs = f.refs(['note1']);
		const result = f.service.packReferences(refs, viewer, async () => {
			if (change === 'deleted') f.state.notes = [];
			if (change === 'private') Object.assign(f.state.notes[0], { visibility: 'specified', visibleUserIds: ['carol'] });
			if (change === 'hidden') f.state.users[1].makeNotesHiddenBefore = 900;
			if (change === 'muted') f.state.mutings.push({ muterId: 'alice', muteeId: 'bob', expiresAt: null });
			if (change === 'renote-muted') f.state.renoteMutings.push({ muterId: 'alice', muteeId: 'bob' });
		});
		if (change === 'renote-muted') await expect(result).rejects.toMatchObject({ code: 'REFRESH_REQUIRED' });
		else expect(await result).toEqual([]);
	});

	test.each(['empty', 'denied', 'packed'] as const)('runs and propagates final validation for %s references', async condition => {
		const f = await fixture([note('note1', condition === 'denied' ? { visibility: 'specified', visibleUserIds: [] } : {})]);
		const callback = jest.fn(async () => { throw new HanamiPlatformError(); });
		await expect(f.service.packReferences(f.refs(condition === 'empty' ? [] : ['note1']), viewer, callback)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
		expect(callback).toHaveBeenCalledTimes(1);
	});
});
