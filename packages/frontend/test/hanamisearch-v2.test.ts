/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import type { entities } from 'misskey-js';
import { createHanamiSearchV2 } from '@/utility/hanamisearch-v2.js';

type Page = { notes: entities.Note[]; nextCursor: string | null };
const note = (id: string) => ({ id } as entities.Note);
function pending() {
	let resolve!: (page: Page) => void;
	const promise = new Promise<Page>(done => { resolve = done; });
	return { promise, resolve };
}

/** Oracle: HanamiSearch v2 pages retain their order; only their cursor selects the following page. */
describe('HanamiSearch v2 results', () => {
	test('appends results in received order and stops at the last page', async () => {
		const request = vi.fn().mockResolvedValueOnce({ notes: [note('a'), note('z')], nextCursor: 'page2' })
			.mockResolvedValueOnce({ notes: [note('m')], nextCursor: null });
		const state = createHanamiSearchV2(request);
		await state.search({ query: '花', host: '.', onlyWithFiles: true });
		await state.loadMore();
		expect(state.notes.value.map(n => n.id)).toEqual(['a', 'z', 'm']);
		expect(request.mock.calls[1][0]).toMatchObject({ query: '花', host: '.', onlyWithFiles: true, cursor: 'page2' });
		await state.loadMore();
		expect(request).toHaveBeenCalledTimes(2);
	});

	test('continues after an empty page with a cursor', async () => {
		const request = vi.fn().mockResolvedValueOnce({ notes: [], nextCursor: 'page2' })
			.mockResolvedValueOnce({ notes: [note('visible')], nextCursor: null });
		const state = createHanamiSearchV2(request);
		await state.search({ query: '花' });
		await state.loadMore();
		expect(state.notes.value.map(n => n.id)).toEqual(['visible']);
	});

	/** Oracle: retrying a failed continuation must preserve both visible results and the failed position. */
	test('retries the same continuation without discarding the first page', async () => {
		const request = vi.fn().mockResolvedValueOnce({ notes: [note('first')], nextCursor: 'page2' })
			.mockRejectedValueOnce(new Error('unavailable'))
			.mockResolvedValueOnce({ notes: [note('second')], nextCursor: null });
		const state = createHanamiSearchV2(request);
		await state.search({ query: '花' });
		await state.loadMore();
		expect(state.error.value).toBe(true);
		expect(state.notes.value.map(n => n.id)).toEqual(['first']);
		expect(state.nextCursor.value).toBe('page2');
		await state.loadMore();
		expect(request.mock.calls[2][0]).toEqual(request.mock.calls[1][0]);
		expect(state.notes.value.map(n => n.id)).toEqual(['first', 'second']);
		expect(state.error.value).toBe(false);
	});

	test('retries an initial failure', async () => {
		const request = vi.fn().mockRejectedValueOnce(new Error('unavailable'))
			.mockResolvedValueOnce({ notes: [note('first')], nextCursor: null });
		const state = createHanamiSearchV2(request);
		await state.search({ query: '花' });
		await state.loadMore();
		expect(request.mock.calls[1][0]).toEqual(request.mock.calls[0][0]);
		expect(state.notes.value.map(n => n.id)).toEqual(['first']);
	});

	/** Oracle: a response belongs to the conditions that issued it, including after a new search or disposal. */
	test('ignores a previous search that finishes after changed conditions', async () => {
		const old = pending();
		const request = vi.fn().mockReturnValueOnce(old.promise)
			.mockResolvedValueOnce({ notes: [note('new')], nextCursor: null });
		const state = createHanamiSearchV2(request);
		const first = state.search({ query: '花', host: '.' });
		await state.search({ query: '花', host: 'example.test' });
		old.resolve({ notes: [note('old')], nextCursor: 'old-page' });
		await first;
		expect(state.notes.value.map(n => n.id)).toEqual(['new']);
		expect(state.nextCursor.value).toBeNull();
		expect(request.mock.calls[1][0].cursor).toBeUndefined();
	});

	test('does not issue duplicate continuation requests while loading', async () => {
		const more = pending();
		const request = vi.fn().mockResolvedValueOnce({ notes: [], nextCursor: 'page2' }).mockReturnValueOnce(more.promise);
		const state = createHanamiSearchV2(request);
		await state.search({ query: '花' });
		const second = state.loadMore();
		await state.loadMore();
		expect(request).toHaveBeenCalledTimes(2);
		more.resolve({ notes: [], nextCursor: null });
		await second;
	});

	test('ignores a response after disposal', async () => {
		const page = pending();
		const state = createHanamiSearchV2(vi.fn().mockReturnValue(page.promise));
		const search = state.search({ query: '花' });
		state.dispose();
		page.resolve({ notes: [note('late')], nextCursor: 'late-page' });
		await search;
		expect(state.notes.value).toEqual([]);
		expect(state.nextCursor.value).toBeNull();
	});
});
