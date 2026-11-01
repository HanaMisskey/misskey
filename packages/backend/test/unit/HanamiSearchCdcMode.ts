import { describe, expect, jest, test } from '@jest/globals';
import type { MiNote, MiUser } from '@/models/_.js';
import { HanamiSearchService } from '@/core/hanamisearch/HanamiSearchService.js';
import { HanamiSearchV2Service } from '@/core/hanamisearch/HanamiSearchV2Service.js';
import { MetaEntityService } from '@/core/entities/MetaEntityService.js';

const viewer = { id: 'alice', host: null } as MiUser;
const platform = { url: 'http://platform.example.test', keyId: 'test', signingKey: 'synthetic-signing-key', sourceId: 'local-misskey', generation: 7 };
const cursorEncryptionKey = '0123456789abcdef'.repeat(4);

function writerFixture(readOnly?: boolean) {
	const updateSettings = jest.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue();
	const addDocuments = jest.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue();
	const deleteDocument = jest.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue();
	const search = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({ hits: [] });
	const dependencies = [
		{ hanamisearch: { index: 'notes', scope: 'global', readOnly } },
		{ index: () => ({ updateSettings, addDocuments, deleteDocument, search }) },
		{}, {}, {}, {}, { parse: () => ({ date: new Date('2026-10-31T00:00:00.000Z') }) }, {},
	] as unknown as ConstructorParameters<typeof HanamiSearchService>;
	return { service: new HanamiSearchService(...dependencies), updateSettings, addDocuments, deleteDocument, search };
}

/** Oracle: infra/docs/hanami-cdc-connection-plan.md §6 leaves search readable while CDC owns writes. The explicit readOnly configuration changes only HanamiSearch writes; its absent/default behavior remains a control. */
describe('HanamiSearch CDC read-only mode', () => {
	test.each([undefined, false, true])('readOnly=%p controls settings, insertion and deletion without disabling v1 reads', async readOnly => {
		const f = writerFixture(readOnly);
		const note = { id: 'note1', userId: 'bob', userHost: null, channelId: null, visibility: 'public', text: '猫', cw: null, tags: [], fileIds: [], emojis: [] } as unknown as MiNote;
		await f.service.indexNote(note);
		await f.service.unindexNote(note);
		await expect(f.service.searchNote('猫', viewer, { preferredMethod: 'hanamisearchv1' }, { limit: 1 })).resolves.toEqual([]);
		const expectedWrites = readOnly === true ? 0 : 1;
		expect(f.updateSettings).toHaveBeenCalledTimes(expectedWrites);
		expect(f.addDocuments).toHaveBeenCalledTimes(expectedWrites);
		expect(f.deleteDocument).toHaveBeenCalledTimes(expectedWrites);
		expect(f.search).toHaveBeenCalledTimes(1);
	});
});

function searchFixture(...settings: [] | [unknown]) {
	const platformConfig = settings.length === 0 ? platform : settings[0];
	const request = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({ hits: [], nextCursor: null });
	const send = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({ ok: true, status: 200, json: async () => ({ hits: [], nextCursor: null }) });
	const packSearchResults = jest.fn<(...args: unknown[]) => Promise<unknown[]>>().mockResolvedValue([]);
	const dependencies = [
		{ hanamisearch: { host: 'legacy.example.test', port: '7700', index: 'notes', apiKey: 'synthetic-legacy-key', cursorEncryptionKey }, ...(platformConfig === undefined ? {} : { hanamiPlatform: platformConfig }) },
		{}, { blockedHosts: [] }, { packMany: jest.fn() },
		{ userMutingsCache: { fetch: async () => new Set() }, userBlockedCache: { fetch: async () => new Set() }, userProfileCache: { fetch: async () => ({ mutedInstances: [] }) } },
		{ isBlockedHost: () => false }, { send }, { request }, { packSearchResults },
	] as unknown as ConstructorParameters<typeof HanamiSearchV2Service>;
	return { service: new HanamiSearchV2Service(...dependencies), request, send, packSearchResults };
}

/** Oracle: Connector ADR-0020 fixes the signed v2 body without weakening its grammar, filters, ranked order or existing opaque outer cursor. Only an absent platform configuration selects the legacy route. */
describe('signed HanamiSearch v2 routing', () => {
	test('preserves v2 syntax and filters while binding the request to the authenticated viewer', async () => {
		const f = searchFixture();
		const query = '(猫 OR 犬) -広告 #花';
		await f.service.searchNote(query, viewer, { userId: 'bob', channelId: 'channel1', host: '.', onlyWithFiles: true }, { limit: 3 });
		expect(f.request).toHaveBeenCalledWith(viewer, '/internal/v1/search', {
			q: query, hanamiSearchVersion: 'v2', sort: [], attributesToRetrieve: ['id'],
			filter: 'userId = "bob" AND channelId = "channel1" AND userHost IS NULL AND fileIds IS NOT NULL', limit: 3,
		});
		expect(f.send).not.toHaveBeenCalled();
	});

	test('packs signed private candidates under current search access instead of the legacy home ceiling', async () => {
		const f = searchFixture();
		f.request.mockResolvedValue({ hits: [{ id: 'private1' }, { id: 'public1' }], nextCursor: null });
		f.packSearchResults.mockResolvedValue([{ id: 'private1', visibility: 'specified', text: 'Aliceの宛先' }, { id: 'public1', visibility: 'public' }]);
		const page = await f.service.searchNote('猫', viewer, {}, { limit: 2 });
		expect(f.packSearchResults).toHaveBeenCalledWith(['private1', 'public1'], viewer, {});
		expect(page.notes.map(note => note.id)).toEqual(['private1', 'public1']);
		expect(f.send).not.toHaveBeenCalled();
	});

	test('keeps an opaque outer cursor and sends its inner continuation only through a new authenticated request', async () => {
		const f = searchFixture();
		f.request.mockResolvedValueOnce({ hits: [{ id: 'note1' }], nextCursor: 'private-position' }).mockResolvedValueOnce({ hits: [], nextCursor: null });
		f.packSearchResults.mockImplementation(async (ids) => [{ id: 'note1', visibility: 'public' }].filter(note => (ids as string[]).includes(note.id)));
		const first = await f.service.searchNote('猫', viewer, {}, { limit: 1 });
		expect(first.nextCursor).toEqual(expect.any(String));
		expect(first.nextCursor).not.toContain('private-position');
		await f.service.searchNote('猫', viewer, {}, { limit: 1, cursor: first.nextCursor });
		expect(f.request).toHaveBeenLastCalledWith(viewer, '/internal/v1/search', expect.objectContaining({ cursor: 'private-position' }));
		await expect(f.service.searchNote('猫', { id: 'bob', host: null } as MiUser, {}, { limit: 1, cursor: first.nextCursor })).rejects.toMatchObject({ code: 'INVALID_CURSOR' });
		expect(f.request).toHaveBeenCalledTimes(2);
	});

	test('preserves REFRESH_REQUIRED from authenticated search for browser text invalidation', async () => {
		const f = searchFixture();
		f.request.mockRejectedValue({ code: 'REFRESH_REQUIRED', httpStatusCode: 409 });
		await expect(f.service.searchNote('猫', viewer, {}, { limit: 1 })).rejects.toMatchObject({ code: 'REFRESH_REQUIRED' });
		expect(f.send).not.toHaveBeenCalled();
	});

	test('keeps the legacy v2 route when platform configuration is absent', async () => {
		const f = searchFixture(undefined);
		await expect(f.service.searchNote('猫', viewer, {}, { limit: 1 })).resolves.toEqual({ notes: [], nextCursor: null });
		expect(f.request).not.toHaveBeenCalled();
		expect(f.send).toHaveBeenCalledTimes(1);
	});

	test.each([null, {}, { ...platform, signingKey: '' }])('fails visibly without legacy fallback for present invalid platform configuration %p', async invalid => {
		const f = searchFixture(invalid);
		f.request.mockRejectedValue(new Error('private-detail-marker'));
		await expect(f.service.searchNote('猫', viewer, {}, { limit: 1 })).rejects.toMatchObject({ code: 'UNAVAILABLE' });
		expect(f.send).not.toHaveBeenCalled();
	});
});

/** Oracle: a present but invalid platform configuration must expose the new feature and its explicit unavailable state. Hiding it behind the old timeline would silently change the requested system. */
describe('recommendation feature presence', () => {
	test.each([[undefined, false], [null, true], [{}, true], [{ ...platform, signingKey: '' }, true], [platform, true]])('publishes configured presence %p as %p in both meta forms', async (hanamiPlatform, enabled) => {
		const query = { where: jest.fn(), andWhere: jest.fn(), getMany: async () => [] };
		query.where.mockReturnValue(query);
		query.andWhere.mockReturnValue(query);
		const dependencies = [
			{ ...(hanamiPlatform === undefined ? {} : { hanamiPlatform }), version: 'local', url: 'http://localhost:3000' },
			{ policies: {} }, { createQueryBuilder: () => query }, { fetch: async () => ({ username: 'proxy' }) },
		] as unknown as ConstructorParameters<typeof MetaEntityService>;
		const service = new MetaEntityService(...dependencies);
		expect(await service.pack()).toHaveProperty('hanamiRecommendationsEnabled', enabled);
		expect(await service.packDetailed()).toHaveProperty('hanamiRecommendationsEnabled', enabled);
	});
});
