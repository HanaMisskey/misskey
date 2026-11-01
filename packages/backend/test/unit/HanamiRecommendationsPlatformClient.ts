import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import type { Config } from '@/config.js';
import type { MiUser } from '@/models/_.js';
import { HanamiPlatformClient, createHanamiAuthzVersion } from '@/core/hanamifeed/HanamiPlatformClient.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { repository, type TestRow } from '../utils/HanamiRecommendationsFixture.js';
import { wireAuthorize, wireOperations, wirePage, wireReference, wireRequests } from '../utils/HanamiPlatformWireFixture.js';

const now = 1730000000000;
const viewer = { id: 'alice', host: null } as MiUser;
const settings = { url: 'http://platform.example.test', keyId: 'local-test-v1', signingKey: '署名用の合成テスト鍵', sourceId: 'local-misskey', generation: 7 };

function fixture(platformConfig: unknown = settings) {
	const rows: Record<string, TestRow[]> = {
		MiUser: [{ id: 'alice', host: null, isSuspended: false, isDeleted: false }],
		MiFollowing: [], MiBlocking: [], MiMuting: [], MiRenoteMuting: [],
		MiUserProfile: [{ userId: 'alice', mutedInstances: [] }], MiMeta: [{ id: 'x', blockedHosts: [] }],
	};
	const barriers: TestRow[] = [];
	let committed = false;
	const lookup = (target: { name: string }) => {
		if (!(target.name in rows)) throw new Error(`Unexpected repository ${target.name}`);
		return repository(() => rows[target.name]);
	};
	const insert = jest.fn<(_target: { name: string }, row: TestRow) => Promise<unknown>>().mockImplementation(async (target, row) => {
		expect(target.name).toBe('MiHanamiReadBarrier');
		barriers.push({ ...row });
		return {};
	});
	const remove = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({});
	const manager = {
		find: (target: { name: string }, options?: { where?: unknown }) => lookup(target).find(options),
		findBy: (target: { name: string }, where: unknown) => lookup(target).findBy(where),
		findOne: (target: { name: string }, options?: { where?: unknown }) => lookup(target).findOne(options),
		findOneBy: (target: { name: string }, where: unknown) => lookup(target).findOneBy(where),
		insert, delete: remove,
	};
	const transaction = jest.fn<(isolation: string, work: (value: typeof manager) => Promise<unknown>) => Promise<unknown>>().mockImplementation(async (isolation, work) => {
		expect(isolation).toBe('REPEATABLE READ');
		committed = false;
		const result = await work(manager);
		committed = true;
		return result;
	});
	const send = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockImplementation(async () => {
		expect(committed).toBe(true);
		return { ok: true, status: 200, json: async () => wirePage() };
	});
	const dependencies = [{ userAgent: 'Misskey local contract test', hanamiPlatform: platformConfig }, { transaction }, { send }] as unknown as ConstructorParameters<typeof HanamiPlatformClient>;
	return { client: new HanamiPlatformClient(...dependencies), dependencies, rows, barriers, transaction, send, insert, remove };
}

afterEach(() => { jest.restoreAllMocks(); });

function addPrivateFields(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(addPrivateFields);
	if (value !== null && typeof value === 'object') return Object.fromEntries([...Object.entries(value).map(([key, child]) => [key, addPrivateFields(child)]), ['privateMarker', 'synthetic-private-value']]);
	return value;
}

function expectFreshObjects(actual: unknown, source: unknown): void {
	if (source === null || typeof source !== 'object') return;
	expect(actual).not.toBe(source);
	if (Array.isArray(source) && Array.isArray(actual)) {
		for (let index = 0; index < source.length; index++) expectFreshObjects(actual[index], source[index]);
	} else if (actual !== null && typeof actual === 'object') {
		for (const [key, child] of Object.entries(actual)) expectFreshObjects(child, Reflect.get(source, key));
	}
}

/** Oracle: the signed wire boundary must validate successful unknown JSON and construct only ADR-0023's allowlisted DTO fields, including nested references/guards and ID-only search hits. Additional unknown fields remain forward compatible. Shape checks do not replace the caller's limit, cursor, and ACK identity checks. */
describe('Hanami signed wire response decoding', () => {
	const operations = wireOperations(viewer);
	const recommendationResponses = [
		wireAuthorize(), wirePage(),
		{ kind: 'authorize', continuation: 'opaque', items: [] },
		{ kind: 'page', page: { ...wirePage().page, items: [], nextCursor: null } },
	];
	const malformedRecommendations: unknown[] = [
		{ kind: 'unknown' }, null, [], {},
		{ ...wireAuthorize(), continuation: '' }, { ...wireAuthorize(), items: {} },
		{ ...wireAuthorize(), items: [{ ...wireReference(), entryId: '' }] },
		{ ...wireAuthorize(), items: [{ ...wireReference(), noteId: 3 }] },
		{ ...wireAuthorize(), items: [{ entryId: 'entry1', noteId: 'note1' }] },
		{ ...wireAuthorize(), items: [{ ...wireReference(), guard: { contentDigest: 'invalid', validUntilMs: 1 } }] },
		{ ...wireAuthorize(), items: [{ ...wireReference(), guard: { contentDigest: 'a'.repeat(64), validUntilMs: -1 } }] },
		{ ...wireAuthorize(), items: [{ ...wireReference(), guard: { contentDigest: 'a'.repeat(64), validUntilMs: 1.5 } }] },
		{ kind: 'page', page: null },
		{ kind: 'page', page: { ...wirePage().page, items: [{ ...wireReference(), guard: null }] } },
		{ kind: 'page', page: { ...wirePage().page, nextCursor: 1 } },
		{ kind: 'page', page: { ...wirePage().page, nextCursor: '' } },
		{ kind: 'page', page: { ...wirePage().page, snapshotId: '' } },
		{ kind: 'page', page: { ...wirePage().page, algorithmVersion: {} } },
		{ kind: 'page', page: { ...wirePage().page, revision: -1 } },
		{ kind: 'page', page: { ...wirePage().page, revision: Number.MAX_SAFE_INTEGER + 1 } },
		{ kind: 'page', page: { ...wirePage().page, validationToken: '' } },
	];
	const malformed: Record<string, unknown[]> = {
		'/internal/v1/recommendations': malformedRecommendations,
		'/internal/v1/recommendations/advance': malformedRecommendations,
		'/internal/v1/recommendations/validate': [{ valid: false }, { valid: 'true' }, {}],
		'/internal/v1/feedback': [{ revision: 0, refreshRequired: false }, { revision: -1, refreshRequired: true }, { revision: 1.5, refreshRequired: true }, { revision: 0 }],
		'/internal/v1/impressions': [{ accepted: -1, duplicates: 0 }, { accepted: 0, duplicates: '1' }, { accepted: 0 }, { accepted: 1.5, duplicates: 0 }],
		'/internal/v1/observations': [{ accepted: 1, duplicates: 0 }, { accepted: 1, duplicates: 0, completedEventIds: [1] }, { accepted: 1, duplicates: 0, completedEventIds: [''] }, { accepted: 1, duplicates: -1, completedEventIds: [] }],
		'/internal/v1/search': [{ hits: [{ id: '' }] }, { hits: [{ id: 'invalid/id' }] }, { hits: [{ id: 1 }] }, { hits: {} }, { hits: [], nextCursor: 1 }, { hits: [], nextCursor: '' }, { hits: [], nextCursor: 'x'.repeat(2049) }],
	};

	test.each(operations)('rejects malformed successful JSON for $path as UNAVAILABLE', async operation => {
		for (const response of malformed[operation.path]) {
			const f = fixture();
			f.send.mockResolvedValue({ ok: true, json: async (): Promise<unknown> => response });
			await expect(operation.send(f.client)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
		}
	});

	test.each(operations)('copies only allowlisted response fields for $path', async operation => {
		const f = fixture();
		const source = addPrivateFields(operation.response);
		const before: unknown = JSON.parse(JSON.stringify(source));
		f.send.mockResolvedValue({ ok: true, json: async (): Promise<unknown> => source });
		const result = await operation.send(f.client);
		expect(result).toStrictEqual(operation.response);
		expectFreshObjects(result, source);
		expect(source).toStrictEqual(before);
	});

	test.each(operations.filter(operation => ['/internal/v1/recommendations', '/internal/v1/recommendations/advance'].includes(operation.path)))('accepts and projects both recommendation variants for $path', async operation => {
		for (const response of recommendationResponses) {
			const f = fixture();
			f.send.mockResolvedValue({ ok: true, json: async (): Promise<unknown> => addPrivateFields(response) });
			await expect(operation.send(f.client)).resolves.toStrictEqual(response);
		}
	});

	/** Oracle: internal_api/search.py omits nextCursor at end of results; the existing Misskey guard also accepts explicit null. */
	test.each([{ hits: [] }, { hits: [], nextCursor: null }])('preserves the optional search cursor in %p', async response => {
		const f = fixture();
		f.send.mockResolvedValue({ ok: true, json: async (): Promise<unknown> => response });
		await expect(f.client.request(viewer, '/internal/v1/search', wireRequests.search)).resolves.toStrictEqual(response);
	});
});

/** Oracle: Connector ADR-0020 and tests/unit/internal_api/fixtures/wire-v1.json at 09e750148bccfc0ae5e37f73d5251fb230d0407a define the canonical byte order. The expected digest is a fixed contract vector, not product-generated output. */
describe('Hanami authenticated context digest', () => {
	test('uses the fixed non-ASCII canonical vector including renote mutes', () => {
		expect(createHanamiAuthzVersion({
			viewerId: '利用者😀', followingIds: ['author-b', 'author-a', 'author-a'], blockingIds: [], blockedByIds: ['remote-b'], mutedIds: [], renoteMutedIds: [], mutedHosts: ['m.example'], blockedHosts: ['blocked.example'],
		})).toBe('b2139457d75372dbd09c0e26e9198458b820b41efca8b6c0c8f4158f8632cdd5');
	});

	test('sorts by UTF8 bytes rather than UTF16 code units or locale', () => {
		const input = { viewerId: 'alice', followingIds: ['😀', '\uE000', 'あ', 'A'], blockingIds: [], blockedByIds: [], mutedIds: [], renoteMutedIds: [], mutedHosts: [], blockedHosts: [] };
		expect(createHanamiAuthzVersion(input)).toBe('dec13530ce1e7e13cc3d1befcf5626f35cde69e14ceacfb9511065543a1021fa');
	});
});

/** Oracle: every signed request (including continuation retries) is attached to a committed, append-only barrier from the same fresh relation snapshot. This single-process test verifies ordering; CDC delivery and PG atomicity require integration tests. */
describe('Hanami platform client', () => {
	test('commits an append-only barrier before sending and binds it to the exact signed body', async () => {
		jest.spyOn(Date, 'now').mockReturnValue(now);
		const f = fixture();
		f.rows.MiFollowing = [{ followerId: 'alice', followeeId: 'bob' }];
		f.rows.MiMuting = [
			{ muterId: 'alice', muteeId: 'expired', expiresAt: new Date(now) },
			{ muterId: 'alice', muteeId: 'active', expiresAt: new Date(now + 1) },
			{ muterId: 'alice', muteeId: 'permanent', expiresAt: null },
		];
		f.rows.MiRenoteMuting = [{ muterId: 'alice', muteeId: 'reposter' }];
		await f.client.request(viewer, '/internal/v1/recommendations', { limit: 20, imageFilter: 'any' });
		const [url, rawOptions] = f.send.mock.calls[0];
		const options = rawOptions as { method: string; headers: Record<string, string>; body: string };
		const envelope = JSON.parse(options.body);
		expect(url).toBe('http://platform.example.test/internal/v1/recommendations');
		expect(options.method).toBe('POST');
		expect(envelope.viewer).toEqual({ id: 'alice', host: null });
		expect(envelope.barrier).toEqual({ sourceId: 'local-misskey', generation: 7, nonce: options.headers['X-Hanami-Nonce'] });
		expect(envelope.barrier.nonce).toMatch(/^[0-9a-f]{32}$/);
		expect(envelope.request).toEqual({ limit: 20, imageFilter: 'any' });
		expect(envelope.authzVersion).toBe('0821bf036a90690b4573938ce17aaa21b24e867d6b3129f335b2d0645ac47f45');
		expect(f.barriers).toHaveLength(1);
		expect(f.barriers[0]).toMatchObject({ nonce: envelope.barrier.nonce, sourceId: 'local-misskey', generation: 7, viewerId: 'alice' });
		expect(new Date(f.barriers[0].createdAt as string | Date).getTime()).toBe(now);
		expect(options.headers['X-Hanami-Timestamp']).toBe(String(now));
		const prefix = `hanami-internal-v1\nlocal-test-v1\nPOST\n/internal/v1/recommendations\n${now}\n${envelope.barrier.nonce}\n`;
		expect(options.headers['X-Hanami-Signature']).toBe(createHmac('sha256', Buffer.from(settings.signingKey, 'utf8')).update(prefix, 'utf8').update(options.body, 'utf8').digest('hex'));
		const [, deleteWhere] = f.remove.mock.calls[0] as [{ name: string }, { createdAt: { type: string; value: Date } }];
		expect(deleteWhere.createdAt.type).toBe('lessThan');
		expect(Number(deleteWhere.createdAt.value)).toBe(now - 3_600_000);
	});

	test('uses a fresh nonce and current relation digest for each retry of the same cursor', async () => {
		const f = fixture();
		const request = { cursor: 'same-position', limit: 1, imageFilter: 'any' as const };
		await f.client.request(viewer, '/internal/v1/recommendations', request);
		f.rows.MiBlocking = [{ blockerId: 'remote-author', blockeeId: 'alice' }];
		await f.client.request(viewer, '/internal/v1/recommendations', request);
		const bodies = f.send.mock.calls.map(([, options]) => JSON.parse((options as { body: string }).body));
		expect(bodies[0].request).toEqual(bodies[1].request);
		expect(bodies[0].barrier.nonce).not.toBe(bodies[1].barrier.nonce);
		expect(bodies[0].authzVersion).not.toBe(bodies[1].authzVersion);
		expect(f.barriers).toHaveLength(2);
	});

	test.each([
		{ host: 'remote.example' }, { isSuspended: true }, { isDeleted: true },
	])('does not create a barrier for a current ineligible viewer %p', async invalid => {
		const f = fixture();
		Object.assign(f.rows.MiUser[0], invalid);
		await expect(f.client.request(viewer, '/internal/v1/search', wireRequests.search)).rejects.toBeDefined();
		expect(f.insert).not.toHaveBeenCalled();
		expect(f.send).not.toHaveBeenCalled();
	});

	test('does not send after a barrier transaction fails', async () => {
		const f = fixture();
		f.insert.mockRejectedValue(new Error('synthetic transaction failure'));
		await expect(f.client.request(viewer, '/internal/v1/search', wireRequests.search)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
		expect(f.send).not.toHaveBeenCalled();
	});

	/** Oracle: canonical recommendation IDs no longer identify a muted reposter, so successful read responses require a fresh relation digest comparison before returning. Durable write acknowledgements keep their accepted meaning. */
	test.each(wireOperations(viewer).filter(operation => ['/internal/v1/recommendations', '/internal/v1/recommendations/advance', '/internal/v1/recommendations/validate', '/internal/v1/search'].includes(operation.path)))('requires refresh if a renote mute changes while $path is in flight', async operation => {
		const f = fixture();
		f.send.mockImplementation(async () => {
			f.rows.MiRenoteMuting.push({ muterId: 'alice', muteeId: 'reposter' });
			return { ok: true, status: 200, json: async () => operation.response };
		});
		await expect(operation.send(f.client)).rejects.toMatchObject({ code: 'REFRESH_REQUIRED' });
		expect(f.barriers).toHaveLength(1);
	});

	test('requires refresh when an active mute expires exactly while a read is in flight', async () => {
		const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
		const f = fixture();
		f.rows.MiMuting.push({ muterId: 'alice', muteeId: 'bob', expiresAt: new Date(now + 1) });
		f.send.mockImplementation(async () => {
			clock.mockReturnValue(now + 1);
			return { ok: true, status: 200, json: async () => wirePage() };
		});
		await expect(f.client.request(viewer, '/internal/v1/recommendations', wireRequests.recommendations)).rejects.toMatchObject({ code: 'REFRESH_REQUIRED' });
	});

	test.each(wireOperations(viewer).filter(operation => ['/internal/v1/feedback', '/internal/v1/impressions', '/internal/v1/observations'].includes(operation.path)))('preserves a durable acknowledgement if relations change during $path', async operation => {
		const f = fixture();
		const acknowledgement = operation.response;
		f.send.mockImplementation(async () => {
			f.rows.MiRenoteMuting.push({ muterId: 'alice', muteeId: 'reposter' });
			return { ok: true, status: 200, json: async () => acknowledgement };
		});
		await expect(operation.send(f.client)).resolves.toEqual(acknowledgement);
	});

	test.each([null, {}, { ...settings, signingKey: '' }, { ...settings, generation: '7' }, { ...settings, generation: true }, { ...settings, generation: 0 }])('rejects invalid configured platform %p before using DB or HTTP', async invalid => {
		const f = fixture(invalid);
		await expect(f.client.request(viewer, '/internal/v1/search', wireRequests.search)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
		expect(f.transaction).not.toHaveBeenCalled();
		expect(f.send).not.toHaveBeenCalled();
	});

	test.each(wireOperations(viewer).filter(operation => ['/internal/v1/recommendations/advance', '/internal/v1/recommendations/validate', '/internal/v1/observations'].includes(operation.path)))('signs the actual bytes and new path $path over real HTTP', async operation => {
		const path = operation.path;
		const received: { path?: string; body: Buffer; headers: Record<string, string | string[] | undefined> }[] = [];
		const server = createServer(async (req, res) => {
			const chunks: Buffer[] = [];
			for await (const chunk of req) chunks.push(Buffer.from(chunk));
			received.push({ path: req.url, body: Buffer.concat(chunks), headers: req.headers });
			res.setHeader('content-type', 'application/json');
			res.end(JSON.stringify(operation.response));
		});
		server.listen(0, '127.0.0.1');
		await once(server, 'listening');
		try {
			const address = server.address();
			if (!address || typeof address === 'string') throw new Error('Missing local address');
			const f = fixture({ ...settings, url: `http://127.0.0.1:${address.port}` });
			f.dependencies[2] = new HttpRequestService(f.dependencies[0] as Config);
			const client = new HanamiPlatformClient(...f.dependencies);
			await expect(operation.send(client)).resolves.toEqual(operation.response);
			expect(received).toHaveLength(1);
			const wire = received[0];
			expect(wire.path).toBe(path);
			expect(wire.body.toString('utf8')).toContain('表示😀');
			const prefix = `hanami-internal-v1\nlocal-test-v1\nPOST\n${path}\n${wire.headers['x-hanami-timestamp']}\n${wire.headers['x-hanami-nonce']}\n`;
			expect(wire.headers['x-hanami-signature']).toBe(createHmac('sha256', Buffer.from(settings.signingKey, 'utf8')).update(prefix).update(wire.body).digest('hex'));
			expect(wire.headers.authorization).toBeUndefined();
		} finally {
			server.closeAllConnections();
			await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
		}
	});
});
