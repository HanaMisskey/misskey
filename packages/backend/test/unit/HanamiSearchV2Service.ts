/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createServer } from 'node:http';
import { once } from 'node:events';
import { createCipheriv, createHash } from 'node:crypto';
import { describe, expect, jest, test } from '@jest/globals';
import { HanamiSearchV2Service } from '@/core/hanamisearch/HanamiSearchV2Service.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import type { Config } from '@/config.js';
import type { MiNote, MiUser } from '@/models/_.js';

const viewer = { id: 'viewer' } as MiUser;
const cursorEncryptionKey = '0123456789abcdef'.repeat(4);
const note = (id: string, extra = {}) => ({ id, userId: 'author', userHost: null, user: { isSuspended: false }, visibility: 'public', fileIds: [], reactions: {}, ...extra });

function fixture(pages: unknown[], rows: ReturnType<typeof note>[][], apiKey: string | undefined = 'test-hanamisearch-v2-key') {
	const send = jest.fn<(...args: unknown[]) => Promise<unknown>>();
	for (const page of pages) send.mockResolvedValueOnce({ ok: true, status: 200, json: async () => page });
	const getMany = jest.fn<() => Promise<unknown[]>>();
	for (const page of rows) getMany.mockResolvedValueOnce(page);
	const query: Record<string, unknown> = { getMany };
	for (const method of ['innerJoinAndSelect', 'leftJoinAndSelect', 'where', 'andWhere']) query[method] = jest.fn(() => query);
	const muted = new Set<string>();
	const blocked = new Set<string>();
	const mutedInstances: string[] = [];
	const dependencies = [
		{ hanamisearch: { host: 'search.example.test', port: 443, ssl: true, apiKey, cursorEncryptionKey, index: 'notes' } },
		{ createQueryBuilder: () => query },
		{ blockedHosts: [] },
		{ packMany: async (notes: MiNote[]) => notes.map(n => ({ ...n })) },
		{ userMutingsCache: { fetch: async () => muted }, userBlockedCache: { fetch: async () => blocked }, userProfileCache: { fetch: async () => ({ mutedInstances }) } },
		{ isBlockedHost: (_hosts: string[], host: string) => host === 'blocked.example.test' },
		{ send },
	] as unknown as ConstructorParameters<typeof HanamiSearchV2Service>;
	return { service: new HanamiSearchV2Service(...dependencies), dependencies, send, muted, blocked, mutedInstances };
}

/** Oracle: HanamiSearch v2 returns its received order after applying current note and viewer restrictions. */
describe('HanamiSearch v2', () => {
	test('retains search order when note retrieval returns a different order', async () => {
		const f = fixture([{ hits: [{ id: 'a' }, { id: 'z' }, { id: 'm' }], nextCursor: null }], [[note('z'), note('m'), note('a')]]);
		const page = await f.service.searchNote('花', viewer, {}, { limit: 3 });
		expect(page.notes.map(n => n.id)).toEqual(['a', 'z', 'm']);
		expect(page.nextCursor).toBeNull();
	});

	test.each([
		['deleted', null],
		['hidden', { isHidden: true }],
		['private', { visibility: 'specified' }],
		['suspended', { user: { isSuspended: true } }],
		['muted', { userId: 'muted' }],
		['blocked', { userId: 'blocked' }],
		['blocked host', { userHost: 'blocked.example.test' }],
	])('continues after a page containing only a %s note', async (_reason, extra) => {
		const f = fixture([
			{ hits: [{ id: 'excluded' }], nextCursor: 'following' },
			{ hits: [{ id: 'visible' }], nextCursor: null },
		], [extra === null ? [] : [note('excluded', extra)], [note('visible')]]);
		f.muted.add('muted');
		f.blocked.add('blocked');
		const page = await f.service.searchNote('花', viewer, {}, { limit: 1 });
		expect(page.notes.map(n => n.id)).toEqual(['visible']);
		expect(f.send).toHaveBeenCalledTimes(2);
	});

	test('removes muted reactions from returned notes', async () => {
		const f = fixture([{ hits: [{ id: 'a' }], nextCursor: null }], [[note('a', { reactions: { '👍': 2 }, reactionCount: 2, reactionAndUserPairCache: ['muted/👍', 'other/👍'] })]]);
		f.muted.add('muted');
		const page = await f.service.searchNote('花', viewer, {}, { limit: 1 });
		expect(page.notes[0].reactions).toEqual({ '👍': 1 });
		expect(page.notes[0].reactionCount).toBe(1);
		expect(page.notes[0]).not.toHaveProperty('reactionAndUserPairCache');
	});

	/** Oracle: one request inspects at most five pages and returns a usable continuation when more remain. */
	test('bounds empty-page requests and advances the continuation', async () => {
		const f = fixture(Array.from({ length: 5 }, (_, i) => ({ hits: [], nextCursor: `page${i + 1}` })), []);
		const page = await f.service.searchNote('花', viewer, {}, { limit: 1 });
		expect(page.notes).toEqual([]);
		expect(typeof page.nextCursor).toBe('string');
		expect(f.send).toHaveBeenCalledTimes(5);
	});

	/** Oracle: continuations may be reused only with the original viewer and conditions, for five minutes. */
	test.each<[string, string, MiUser, Parameters<HanamiSearchV2Service['searchNote']>[2], number]>([
		['query', '別の花', viewer, {}, 1],
		['viewer', '花', { id: 'other' } as MiUser, {}, 1],
		['host', '花', viewer, { host: '.' }, 1],
		['user', '花', viewer, { userId: 'other' }, 1],
		['channel', '花', viewer, { channelId: 'channel' }, 1],
		['files', '花', viewer, { onlyWithFiles: true }, 1],
		['limit', '花', viewer, {}, 2],
	])('rejects a continuation reused with changed %s', async (_name, query, user, filters, limit) => {
		const f = fixture([{ hits: [{ id: 'a' }], nextCursor: 'private-page-marker' }], [[note('a')]]);
		const first = await f.service.searchNote('花', viewer, {}, { limit: 1 });
		await expect(f.service.searchNote(query, user, filters, { limit, cursor: first.nextCursor! })).rejects.toMatchObject({ code: 'INVALID_CURSOR' });
		expect(f.send).toHaveBeenCalledTimes(1);
	});

	test('returns an opaque continuation and accepts retry at the same position', async () => {
		const f = fixture([{ hits: [{ id: 'a' }], nextCursor: 'private-page-marker' }, { hits: [], nextCursor: null }], [[note('a')]]);
		const first = await f.service.searchNote('花', viewer, {}, { limit: 1 });
		expect(first.nextCursor).not.toContain('private-page-marker');
		expect(Buffer.from(first.nextCursor!, 'base64url').toString()).not.toContain('private-page-marker');
		await f.service.searchNote('花', viewer, {}, { limit: 1, cursor: first.nextCursor! });
		expect(f.send).toHaveBeenCalledTimes(2);
	});

	test('rejects expired and modified continuations before searching', async () => {
		const f = fixture([{ hits: [{ id: 'a' }], nextCursor: 'next' }], [[note('a')]]);
		const first = await f.service.searchNote('花', viewer, {}, { limit: 1 });
		await expect(f.service.searchNote('花', viewer, {}, { limit: 1, cursor: `x${first.nextCursor}` })).rejects.toMatchObject({ code: 'INVALID_CURSOR' });
		const now = Date.now();
		const clock = jest.spyOn(Date, 'now').mockReturnValue(now + 301_000);
		try {
			await expect(f.service.searchNote('花', viewer, {}, { limit: 1, cursor: first.nextCursor! })).rejects.toMatchObject({ code: 'INVALID_CURSOR' });
		} finally {
			clock.mockRestore();
		}
		expect(f.send).toHaveBeenCalledTimes(1);
	});

	test.each(['', undefined])('is unavailable without configured credentials (%p)', async (apiKey) => {
		const f = fixture([], []);
		(f.dependencies[0].hanamisearch as { apiKey?: string }).apiKey = apiKey;
		const service = new HanamiSearchV2Service(...f.dependencies);
		await expect(service.searchNote('花', viewer, {}, { limit: 1 })).rejects.toMatchObject({ code: 'UNAVAILABLE' });
		expect(f.send).not.toHaveBeenCalled();
	});

	/** Oracle: the dedicated key must represent exactly 32 bytes in hex; invalid configuration disables only v2 requests, without preventing service construction or contacting HanamiSearch. */
	test.each([undefined, null, '', 'ab'.repeat(31), 'ab'.repeat(33), 'g'.repeat(64), `${cursorEncryptionKey}\n`, 42, [cursorEncryptionKey]])('is unavailable with an invalid cursor encryption key (%p)', async (key) => {
		const f = fixture([{ hits: [], nextCursor: null }], []);
		Object.assign(f.dependencies[0].hanamisearch!, { cursorEncryptionKey: key });
		const service = new HanamiSearchV2Service(...f.dependencies);
		await expect(service.searchNote('花', viewer, {}, { limit: 1 })).rejects.toMatchObject({ code: 'UNAVAILABLE' });
		expect(f.send).not.toHaveBeenCalled();
	});

	/** Oracle: instances configured with the same 32 key bytes share continuations; hex letter case does not change those bytes. Separate instances exercise key persistence without requiring external services. */
	test.each([cursorEncryptionKey, cursorEncryptionKey.toUpperCase()])('shares a continuation across independently constructed services (%p)', async (key) => {
		const first = fixture([{ hits: [{ id: 'a' }], nextCursor: 'shared-position' }], [[note('a')]]);
		const page = await first.service.searchNote('花', viewer, {}, { limit: 1 });
		const second = fixture([{ hits: [], nextCursor: null }], []);
		Object.assign(second.dependencies[0].hanamisearch!, { cursorEncryptionKey: key });
		const service = new HanamiSearchV2Service(...second.dependencies);
		await expect(service.searchNote('花', viewer, {}, { limit: 1, cursor: page.nextCursor! })).resolves.toEqual({ notes: [], nextCursor: null });
		expect(second.send).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ body: expect.stringContaining('"cursor":"shared-position"') }), expect.anything());
	});

	/** Oracle: rotating HTTP credentials must preserve existing continuations when the independent cursor encryption key stays the same. */
	test('accepts a continuation after changing the API key', async () => {
		const first = fixture([{ hits: [{ id: 'a' }], nextCursor: 'shared-position' }], [[note('a')]]);
		const page = await first.service.searchNote('花', viewer, {}, { limit: 1 });
		const second = fixture([{ hits: [], nextCursor: null }], [], 'rotated-api-key');
		await expect(second.service.searchNote('花', viewer, {}, { limit: 1, cursor: page.nextCursor! })).resolves.toEqual({ notes: [], nextCursor: null });
		expect(second.send).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer rotated-api-key' }), body: expect.stringContaining('"cursor":"shared-position"') }), expect.anything());
	});

	/** Oracle: changing only the cursor encryption key invalidates old continuations before a search request is sent. */
	test('rejects a continuation after changing the cursor encryption key', async () => {
		const first = fixture([{ hits: [{ id: 'a' }], nextCursor: 'shared-position' }], [[note('a')]]);
		const page = await first.service.searchNote('花', viewer, {}, { limit: 1 });
		const second = fixture([{ hits: [], nextCursor: null }], []);
		Object.assign(second.dependencies[0].hanamisearch!, { cursorEncryptionKey: 'fedcba9876543210'.repeat(4) });
		const service = new HanamiSearchV2Service(...second.dependencies);
		await expect(service.searchNote('花', viewer, {}, { limit: 1, cursor: page.nextCursor! })).rejects.toMatchObject({ code: 'INVALID_CURSOR' });
		expect(second.send).not.toHaveBeenCalled();
	});

	/** Oracle: migration must not accept API-key-derived continuations. The legacy wire fixture follows commit 56075ed1bc5df0d2975006f45cb91245ee017a0c; matching request conditions and a fixed clock keep its fingerprint and expiry valid, so rejection cannot be attributed to either constraint. */
	test('rejects an unexpired legacy continuation with matching search conditions', async () => {
		const now = 1_783_000_000_000;
		const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
		try {
			const apiKey = 'test-hanamisearch-v2-key';
			const fingerprint = createHash('sha256').update(JSON.stringify(['花', 'viewer', [], 1, 'search.example.test', 443, 'notes'])).digest('hex');
			const iv = Buffer.alloc(12, 1);
			const cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(apiKey).digest(), iv);
			const payload = JSON.stringify({ cursor: 'legacy-position', fingerprint, expiresAt: now + 300_000 });
			const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
			const cursor = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
			const f = fixture([{ hits: [], nextCursor: null }], [], apiKey);
			await expect(f.service.searchNote('花', viewer, {}, { limit: 1, cursor })).rejects.toMatchObject({ code: 'INVALID_CURSOR' });
			expect(f.send).not.toHaveBeenCalled();
		} finally {
			clock.mockRestore();
		}
	});

	test.each([{ hits: 'invalid' }, { hits: [{ id: 3 }] }, { hits: [], nextCursor: 4 }])('rejects an invalid response %p', async (response) => {
		const f = fixture([response], []);
		await expect(f.service.searchNote('花', viewer, {}, { limit: 1 })).rejects.toMatchObject({ code: 'UNAVAILABLE' });
	});

	test('rejects an oversized continuation before sending a request', async () => {
		const f = fixture([], []);
		await expect(f.service.searchNote('花', viewer, {}, { limit: 1, cursor: 'a'.repeat(4097) })).rejects.toMatchObject({ code: 'INVALID_CURSOR' });
		expect(f.send).not.toHaveBeenCalled();
	});

	/** Oracle: every returned continuation must fit the API input limit and remain usable. */
	test.each(['花'.repeat(2000), '\u0000'.repeat(1000)])('rejects a response whose continuation exceeds the supported size (%#)', async (nextCursor) => {
		const f = fixture([{ hits: [{ id: 'a' }], nextCursor }], [[note('a')]]);
		await expect(f.service.searchNote('花', viewer, {}, { limit: 1 })).rejects.toMatchObject({ code: 'UNAVAILABLE' });
	});

	test('fails when the continuation does not advance', async () => {
		const f = fixture([{ hits: [], nextCursor: 'same' }, { hits: [], nextCursor: 'same' }], []);
		await expect(f.service.searchNote('花', viewer, {}, { limit: 1 })).rejects.toMatchObject({ code: 'UNAVAILABLE' });
		expect(f.send).toHaveBeenCalledTimes(2);
	});

	/** Oracle: failed requests must be observable as failure, and retry must use the same continuation. */
	test('sanitizes a failed continuation and accepts a retry', async () => {
		const f = fixture([{ hits: [{ id: 'a' }], nextCursor: 'second' }], [[note('a')]]);
		const first = await f.service.searchNote('花', viewer, {}, { limit: 1 });
		f.send.mockRejectedValueOnce(new Error('private-detail-marker'));
		await expect(f.service.searchNote('花', viewer, {}, { limit: 1, cursor: first.nextCursor! })).rejects.toMatchObject({ code: 'UNAVAILABLE', message: expect.not.stringContaining('private-detail-marker') });
		f.send.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ hits: [], nextCursor: null }) });
		expect(await f.service.searchNote('花', viewer, {}, { limit: 1, cursor: first.nextCursor! })).toEqual({ notes: [], nextCursor: null });
		expect(f.send.mock.calls[2]).toEqual(f.send.mock.calls[1]);
	});

	/** Oracle: the HanamiSearch v2 HTTP request uses v2, carries selected conditions, and preserves the returned continuation. */
	test('uses the configured HTTP address and credentials for both pages', async () => {
		const requests: { url: string | undefined; authorization: string | undefined; body: Record<string, unknown> }[] = [];
		const server = createServer(async (req, res) => {
			let body = '';
			for await (const chunk of req) body += chunk;
			requests.push({ url: req.url, authorization: req.headers.authorization, body: JSON.parse(body) });
			res.setHeader('content-type', 'application/json');
			res.end(JSON.stringify(requests.length === 1 ? { hits: [{ id: 'a' }], nextCursor: 'second-page' } : { hits: [], nextCursor: null }));
		});
		server.listen(0, '127.0.0.1');
		await once(server, 'listening');
		try {
			const address = server.address();
			if (!address || typeof address === 'string') throw new Error('Expected local test address');
			const f = fixture([], [[note('a', { fileIds: ['file1'] })]]);
			const config = { userAgent: 'Misskey test', hanamisearch: { host: '127.0.0.1', port: String(address.port), ssl: false, apiKey: 'test-key', cursorEncryptionKey, index: 'test' } } as Config;
			f.dependencies[0] = config;
			f.dependencies[6] = new HttpRequestService(config);
			const service = new HanamiSearchV2Service(...f.dependencies);
			const first = await service.searchNote('花', viewer, { host: '.', userId: 'author', onlyWithFiles: true }, { limit: 1 });
			await service.searchNote('花', viewer, { host: '.', userId: 'author', onlyWithFiles: true }, { limit: 1, cursor: first.nextCursor! });
			expect(requests).toHaveLength(2);
			expect(requests[0].url).toBe('/indexes/test---notes/search');
			expect(requests[0].authorization).toBe('Bearer test-key');
			expect(requests[0].body).toMatchObject({ q: '花', hanamiSearchVersion: 'v2', limit: 1 });
			expect(requests[0].body.filter).toContain('userHost IS NULL');
			expect(requests[0].body.filter).toContain('author');
			expect(requests[0].body.filter).toContain('fileIds IS NOT NULL');
			expect(requests[1].body.cursor).toBe('second-page');
		} finally {
			server.closeAllConnections();
			await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
		}
	});
});
