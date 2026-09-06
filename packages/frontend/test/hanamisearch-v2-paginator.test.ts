/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test, vi } from 'vitest';
import { createHanamiSearchV2Paginator } from '@/utility/hanamisearch-v2.js';

/** Oracle: the common list must retain its continuation and earlier results when a later page fails, including an empty first page. */
test('adapts empty pages and retry to the common paginator without losing the cursor', async () => {
	const request = vi.fn().mockResolvedValueOnce({ notes: [], nextCursor: 'next' })
		.mockRejectedValueOnce(new Error('offline'))
		.mockResolvedValueOnce({ notes: [{ id: 'one', createdAt: '2026-01-01' }], nextCursor: null });
	const paginator = createHanamiSearchV2Paginator(() => ({ query: '花' }), request);
	await paginator.init();
	expect(paginator.fetching.value).toBe(false);
	expect(paginator.canFetchOlder.value).toBe(true);
	await paginator.fetchOlder();
	expect(paginator.error.value).toBe(false);
	expect(paginator.fetchOlderError.value).toBe(true);
	await paginator.fetchOlder();
	expect(paginator.items.value.map(x => x.id)).toEqual(['one']);
	expect(request.mock.calls[2][0].cursor).toBe('next');
	expect(paginator.canFetchOlder.value).toBe(false);
});

/** Oracle: refreshing a cursor-based result restarts the submitted search, not the next page. */
test('reload starts the submitted query without a cursor', async () => {
	const request = vi.fn().mockResolvedValue({ notes: [{ id: 'one', createdAt: '2026-01-01' }], nextCursor: 'next' });
	const paginator = createHanamiSearchV2Paginator(() => ({ query: '花' }), request);
	await paginator.init();
	paginator.removeItem('one');
	expect(paginator.items.value).toEqual([]);
	await paginator.reload();
	expect(request.mock.calls[1][0]).toEqual({ query: '花' });
	expect(paginator.items.value.map(x => x.id)).toEqual(['one']);
});
