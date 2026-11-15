import { afterEach, describe, expect, test, vi } from 'vitest';
import { TokenPaginator } from '@/hana/scripts/token-paginator.js';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: request }));
afterEach(() => request.mockReset());

/** Oracle: ADR-0020 invalidates a private search cursor when current authorization changes. REFRESH_REQUIRED cannot leave old private text visible or retry the invalidated cursor; other errors retain existing retry behavior. */
describe('authorization refresh in token search pagination', () => {
	test('discards stale text and continuation, then restarts from the initial query', async () => {
		request.mockResolvedValueOnce({ notes: [{ id: 'private1', text: 'old recipient text' }], nextCursor: 'old-cursor' })
			.mockRejectedValueOnce({ code: 'REFRESH_REQUIRED' })
			.mockResolvedValueOnce({ notes: [{ id: 'public1' }], nextCursor: null });
		const paginator = new TokenPaginator('notes/hanamisearch-v2', { params: { query: '猫' } });
		await paginator.init();
		await paginator.fetchOlder();
		expect(paginator.items.value).toEqual([]);
		expect(paginator.canFetchOlder.value).toBe(false);
		expect(paginator.error.value).toBe(true);
		await paginator.reload();
		expect(request.mock.calls[2]).toEqual(['notes/hanamisearch-v2', { query: '猫', limit: 10 }]);
		expect(paginator.items.value.map(note => note.id)).toEqual(['public1']);
		paginator.dispose();
	});

	test.each(['UNAVAILABLE', 'INVALID_CURSOR'])('retains the existing page and retry position for %s', async code => {
		request.mockResolvedValueOnce({ notes: [{ id: 'first' }], nextCursor: 'next' })
			.mockRejectedValueOnce({ code })
			.mockResolvedValueOnce({ notes: [{ id: 'second' }], nextCursor: null });
		const paginator = new TokenPaginator('notes/hanamisearch-v2', { params: { query: '猫' } });
		await paginator.init();
		await paginator.fetchOlder();
		expect(paginator.items.value.map(note => note.id)).toEqual(['first']);
		expect(paginator.fetchOlderError.value).toBe(true);
		await paginator.fetchOlder();
		expect(request.mock.calls[2][1].cursor).toBe('next');
		expect(paginator.items.value.map(note => note.id)).toEqual(['first', 'second']);
		paginator.dispose();
	});
});
