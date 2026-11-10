import { describe, expect, test, vi } from 'vitest';
const { request, supported } = vi.hoisted(() => ({ request: vi.fn(), supported: { value: true } }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: request }));
vi.mock('@/utility/navigator.js', () => ({ isSupportShare: () => supported.value }));
vi.mock('@/utility/hanami-device-context.js', () => ({ captureHanamiDeviceContext: () => ({ deviceClass: 'unknown', viewportClass: 'unknown', primaryPointer: 'unknown' }) }));
vi.mock('@/i.js', () => ({ $i: { id: 'alice' } }));
vi.mock('@/local-storage.js', () => ({ miLocalStorage: { getItem: () => null, setItem: vi.fn() } }));
import { HanamiRecommendationPaginator } from '@/hana/scripts/hanami-recommendation-paginator.js';

/** Oracle: addendum §8 uses the same capability function as the share menu, recaptures on a new snapshot, and keeps it separate from device context. Connector tests cover saved-cursor immutability. */
describe('recommendation browser capabilities', () => {
	test('captures nativeShare on new snapshot requests and preserves cursor pagination', async () => {
		request.mockResolvedValue({ items: [], nextCursor: 'cursor-a', snapshotId: 'snapshot-a', revision: 0 });
		const paginator = new HanamiRecommendationPaginator(() => false);
		try {
			await paginator.init();
			expect(request.mock.calls[0][1]).toMatchObject({ clientCapabilities: { nativeShare: true } });
			expect(request.mock.calls[0][1].deviceContext).not.toHaveProperty('nativeShare');
			supported.value = false;
			await paginator.fetchOlder();
			expect(request.mock.calls[1][1]).toMatchObject({ cursor: 'cursor-a' });
			await paginator.reload();
			expect(request.mock.calls[2][1]).toMatchObject({ refresh: true, clientCapabilities: { nativeShare: false } });
			expect(request.mock.calls[2][1]).not.toHaveProperty('cursor');
		} finally { paginator.dispose(); }
	});
});
