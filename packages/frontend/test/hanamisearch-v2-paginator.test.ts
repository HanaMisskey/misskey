/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import type { entities } from 'misskey-js';
import { TokenPaginator } from '@/hana/scripts/token-paginator.js';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: request }));
const note = (id: string) => ({ id, createdAt: '2026-01-01' } as entities.Note);
const create = (query = '花') => new TokenPaginator('notes/hanamisearch-v2', { params: { query }, limit: 20 });
function pending() {
	let resolve!: (page: { notes: entities.Note[]; nextCursor: string | null }) => void;
	const promise = new Promise<{ notes: entities.Note[]; nextCursor: string | null }>(done => { resolve = done; });
	return { promise, resolve };
}
afterEach(() => request.mockReset());

describe('TokenPaginator', () => {
	test('preserves ranking, removes duplicates, keeps the same limit and stops at the cursor end', async () => {
		request.mockResolvedValueOnce({ notes: [note('z'), note('a'), note('a')], nextCursor: 'next' })
			.mockResolvedValueOnce({ notes: [note('z'), note('b')], nextCursor: null });
		const paginator = create();
		await paginator.init();
		await paginator.fetchOlder();
		expect(paginator.items.value.map(n => n.id)).toEqual(['z', 'a', 'b']);
		expect(request.mock.calls[1]).toEqual(['notes/hanamisearch-v2', { query: '花', limit: 20, cursor: 'next' }]);
		await paginator.fetchOlder();
		expect(request).toHaveBeenCalledTimes(2);
	});

	test('continues from an empty page and retries the same cursor after failure', async () => {
		request.mockResolvedValueOnce({ notes: [], nextCursor: 'next' })
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValueOnce({ notes: [note('one')], nextCursor: null });
		const paginator = create();
		await paginator.init();
		expect(paginator.canFetchOlder.value).toBe(true);
		await paginator.fetchOlder();
		expect(paginator.error.value).toBe(false);
		expect(paginator.fetchOlderError.value).toBe(true);
		await paginator.fetchOlder();
		expect(paginator.items.value.map(n => n.id)).toEqual(['one']);
		expect(request.mock.calls[2]).toEqual(request.mock.calls[1]);
		expect(paginator.fetchOlderError.value).toBe(false);
	});

	test('preserves loaded notes on a failed continuation', async () => {
		request.mockResolvedValueOnce({ notes: [note('first')], nextCursor: 'next' }).mockRejectedValueOnce(new Error('offline'));
		const paginator = create();
		await paginator.init();
		await paginator.fetchOlder();
		expect(paginator.items.value.map(n => n.id)).toEqual(['first']);
		expect(paginator.fetchOlderError.value).toBe(true);
		expect(paginator.canFetchOlder.value).toBe(true);
	});

	test('retries initial failures and reloads submitted conditions without a cursor', async () => {
		request.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ notes: [note('one')], nextCursor: 'next' });
		const params = { query: '花', host: '.', onlyWithFiles: true };
		const paginator = new TokenPaginator('notes/hanamisearch-v2', { params, limit: 20 });
		await paginator.init();
		expect(paginator.error.value).toBe(true);
		params.query = 'editing';
		await paginator.reload();
		expect(paginator.error.value).toBe(false);
		await paginator.fetchOlder();
		await paginator.reload();
		expect(request.mock.calls[3][1]).toEqual({ query: '花', host: '.', onlyWithFiles: true, limit: 20 });
	});

	test('ignores an old continuation after a reload', async () => {
		const old = pending();
		request.mockResolvedValueOnce({ notes: [note('first')], nextCursor: 'next' }).mockReturnValueOnce(old.promise)
			.mockResolvedValueOnce({ notes: [note('fresh')], nextCursor: null });
		const paginator = create();
		await paginator.init();
		const more = paginator.fetchOlder();
		await paginator.reload();
		old.resolve({ notes: [note('old')], nextCursor: 'old-next' });
		await more;
		expect(paginator.items.value.map(n => n.id)).toEqual(['fresh']);
		expect(paginator.canFetchOlder.value).toBe(false);
	});

	test('does not issue concurrent continuation requests', async () => {
		const next = pending();
		request.mockResolvedValueOnce({ notes: [], nextCursor: 'next' }).mockReturnValueOnce(next.promise);
		const paginator = create();
		await paginator.init();
		const more = paginator.fetchOlder();
		await paginator.fetchOlder();
		expect(request).toHaveBeenCalledTimes(2);
		next.resolve({ notes: [], nextCursor: null });
		await more;
	});

	test('ignores responses and new requests after disposal', async () => {
		const page = pending();
		request.mockReturnValue(page.promise);
		const paginator = create();
		const initial = paginator.init();
		paginator.dispose();
		page.resolve({ notes: [note('late')], nextCursor: 'late' });
		await initial;
		await paginator.reload();
		await paginator.fetchOlder();
		expect(request).toHaveBeenCalledTimes(1);
		expect(paginator.items.value).toEqual([]);
	});

	test('keeps all fetched results beyond the common trim limit and applies updates and deletions', async () => {
		request.mockResolvedValue({ notes: Array.from({ length: 60 }, (_, i) => note(String(i))), nextCursor: 'next' });
		const paginator = create();
		await paginator.init();
		paginator.trim();
		expect(paginator.items.value).toHaveLength(60);
		paginator.updateItem('59', item => ({ ...item, text: 'updated' }));
		expect(paginator.items.value[59].text).toBe('updated');
		paginator.enqueue(note('59'));
		paginator.removeItem('59');
		paginator.releaseQueue();
		expect(paginator.items.value).toHaveLength(59);
		expect(paginator.canFetchOlder.value).toBe(true);
	});
});
