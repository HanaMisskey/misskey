import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { HanamiInteraction } from '@/utility/hanami-impressions.js';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: request }));
vi.mock('@/i.js', () => ({ $i: { id: 'device-context-viewer' } }));
vi.mock('@/local-storage.js', () => ({ miLocalStorage: { getItem: () => null, setItem: vi.fn() } }));
vi.mock('@/utility/copy-to-clipboard.js', () => ({ copyToClipboard: vi.fn() }));
vi.mock('@/utility/device-kind.js', () => ({ deviceKind: 'tablet', DEFAULT_DEVICE_KIND: 'tablet' }));

const mobile = { deviceClass: 'mobile', viewportClass: 'compact', primaryPointer: 'coarse' };
const desktop = { deviceClass: 'desktop', viewportClass: 'wide', primaryPointer: 'fine' };

function environment(kind: 'mobile' | 'desktop') {
	vi.stubGlobal('navigator', { userAgent: kind === 'mobile' ? 'iPhone Mobile' : 'Windows NT 10.0', maxTouchPoints: 0 });
	vi.stubGlobal('innerWidth', kind === 'mobile' ? 390 : 1440);
	vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === `(pointer: ${kind === 'mobile' ? 'coarse' : 'fine'})` }));
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-11-09T00:00:00.000Z'));
	vi.resetModules();
	request.mockReset();
	request.mockImplementation(async (route: string) => {
		if (route === 'hanami-impressions') return undefined;
		throw new Error(`Unexpected route ${route}`);
	});
	environment('mobile');
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

async function interactionSource() {
	const { withHanamiRecommendation } = await import('@/utility/hanami-recommendation-context.js');
	return withHanamiRecommendation({ id: 'note-device', userId: 'author-device', user: { id: 'author-device' } }, {
		eventId: 'source-device', snapshotId: 'snapshot-device', entryId: 'entry-device', noteId: 'note-device',
	}).recommendationEvent;
}

/** Oracle: 端末文脈契約（2026-11-09）§1/4。各離散操作は成立時点、推薦は各取得時点の粗い環境を送る。UI設定のdeviceKindは事実の入力にせず、再送では新環境を採り直さない。APIのみをdoubleとし、分類・操作記録・キュー・paginatorを実行する。 */
describe('device context on observations and recommendation requests', () => {
	test.each<HanamiInteraction>([
		{ kind: 'detail_open' }, { kind: 'link_copy' }, { kind: 'share' }, { kind: 'image_open', fileId: 'file-device' },
		{ kind: 'action', action: 'reply', evidenceNoteId: 'reply-device' }, { kind: 'action', action: 'quote', evidenceNoteId: 'quote-device' },
		{ kind: 'action', action: 'follow' }, { kind: 'action', action: 'mute' }, { kind: 'action', action: 'block' }, { kind: 'action', action: 'report' },
	])('captures current context for $kind/$action and preserves it while transport is deferred', async interaction => {
		const source = await interactionSource();
		const { recordHanamiInteraction, flushHanamiObservations } = await import('@/utility/hanami-interactions.js');
		recordHanamiInteraction(source, interaction);
		environment('desktop');
		await flushHanamiObservations();
		recordHanamiInteraction(source, interaction);
		await flushHanamiObservations();
		const records = request.mock.calls.flatMap(([, body]) => body.observations);
		expect(records).toHaveLength(2);
		expect(records[0]).toMatchObject({ ...interaction, deviceContext: mobile });
		expect(records[1]).toMatchObject({ ...interaction, deviceContext: desktop });
		expect(request.mock.calls.every(([route, body]) => route === 'hanami-impressions' && body.version === 4)).toBe(true);
		expect(Object.keys(records[0].deviceContext).sort()).toEqual(['deviceClass', 'primaryPointer', 'viewportClass']);
	});

	test('retries an operation with its captured context and gives the next operation the new environment', async () => {
		const source = await interactionSource();
		const { recordHanamiInteraction, flushHanamiObservations } = await import('@/utility/hanami-interactions.js');
		request.mockRejectedValueOnce(new Error('Synthetic interrupted local transport'));
		recordHanamiInteraction(source, { kind: 'detail_open' });
		await flushHanamiObservations();
		environment('desktop');
		recordHanamiInteraction(source, { kind: 'share' });
		await vi.advanceTimersByTimeAsync(500);
		await flushHanamiObservations();
		expect(request.mock.calls).toHaveLength(3);
		const records = request.mock.calls.map(([, body]) => body.observations[0]);
		expect(records[0]).toMatchObject({ kind: 'detail_open', deviceContext: mobile });
		expect(records[1]).toEqual(records[0]);
		expect(records[2]).toMatchObject({ kind: 'share', deviceContext: desktop });
	});

	test('captures context independently for initial, cursor continuation, and refresh requests', async () => {
		request.mockResolvedValue({ items: [], nextCursor: 'continuation-device', snapshotId: 'snapshot-device', revision: 0 });
		const { HanamiRecommendationPaginator } = await import('@/hana/scripts/hanami-recommendation-paginator.js');
		const paginator = new HanamiRecommendationPaginator(() => false);
		try {
			await paginator.init();
			environment('desktop');
			await paginator.fetchOlder();
			vi.stubGlobal('innerWidth', 500);
			await paginator.reload();
			expect(request.mock.calls).toHaveLength(3);
			expect(request.mock.calls[0]).toEqual(['notes/hanami-recommendations', expect.objectContaining({ refresh: false, deviceContext: mobile })]);
			expect(request.mock.calls[1]).toEqual(['notes/hanami-recommendations', expect.objectContaining({ cursor: 'continuation-device', deviceContext: desktop })]);
			expect(request.mock.calls[2]).toEqual(['notes/hanami-recommendations', expect.objectContaining({ refresh: true, deviceContext: { ...desktop, viewportClass: 'compact' } })]);
		} finally { paginator.dispose(); }
	});
});
