import { describe, expect, jest, test } from '@jest/globals';
import type { HanamiRecommendationsService } from '@/core/hanamifeed/HanamiRecommendationsService.js';
import { HanamiPlatformError } from '@/core/hanamifeed/HanamiPlatformClient.js';
import type { MiLocalUser } from '@/models/User.js';
import ImpressionsEndpoint, { meta } from '@/server/api/endpoints/hanami-impressions.js';
import RecommendationsEndpoint from '@/server/api/endpoints/notes/hanami-recommendations.js';
import { detailObservation, imageObservation, interactionAck, interactionIdentity, replyObservation, viewportObservation } from '../utils/HanamiInteractionsFixture.js';

const viewer = { id: 'alice', host: null } as MiLocalUser;
const deviceContext = { deviceClass: 'mobile', viewportClass: 'compact', primaryPointer: 'coarse' };
const invalidDeviceContexts: unknown[] = [
	null, [], 'mobile', 1, true, {},
	{ viewportClass: 'compact', primaryPointer: 'coarse' },
	{ deviceClass: 'mobile', primaryPointer: 'coarse' },
	{ deviceClass: 'mobile', viewportClass: 'compact' },
	...['deviceClass', 'viewportClass', 'primaryPointer'].flatMap(key => [null, 1, [], 'unsupported'].map(value => ({ ...deviceContext, [key]: value }))),
	{ ...deviceContext, userAgent: 'synthetic-private-UA' }, { ...deviceContext, deviceId: 'synthetic-private-ID' },
];

function fixture() {
	const submitImpressions = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(interactionAck);
	const getRecommendations = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({ items: [], nextCursor: null });
	const service = { submitImpressions, getRecommendations } as unknown as HanamiRecommendationsService;
	return { submitImpressions, getRecommendations, endpoint: new ImpressionsEndpoint(service), recommendations: new RecommendationsEndpoint(service) };
}

/** Oracle: 推薦操作観測契約（2026-11-08）§1。全観測は既存入口の v4 batch を通り、認証済み viewer を使う。単一プロセスでは schema と認証宣言を検証し、実 HTTP の認証はローカル環境検証で補う。 */
describe('Hanami typed interaction endpoint', () => {
	/** Oracle: 端末文脈契約（2026-11-09）§1/4。全種類のv4観測でoptional contextをそのまま転送し、旧clientの省略も受け付ける。 */
	test.each([
		viewportObservation(), detailObservation(), imageObservation(),
		{ ...interactionIdentity, kind: 'link_copy' }, { ...interactionIdentity, kind: 'share' },
		replyObservation(), { ...replyObservation(), action: 'quote' },
		...['follow', 'mute', 'block', 'report'].map(action => ({ ...interactionIdentity, kind: 'action', action })),
	])('preserves device context on v4 $kind/$action beside a legacy observation', async observation => {
		const f = fixture();
		const payload = { version: 4, observations: [{ ...observation, deviceContext }, { ...detailObservation(), eventId: 'old-client' }] };
		await f.endpoint.exec(payload, viewer, null);
		expect(f.submitImpressions).toHaveBeenCalledWith(viewer, payload);
		expect((f.submitImpressions.mock.calls[0][1] as typeof payload).observations[1]).not.toHaveProperty('deviceContext');
	});

	/** Oracle: §1は存在するcontextの3キーを必須とし、型違い・列挙外・未知キーを拒否する。一つの不正recordがあれば隣の有効recordもサービスへ渡さない。 */
	test.each(invalidDeviceContexts)('rejects malformed device context %p with no partial batch effect', async invalid => {
		const f = fixture();
		await expect(f.endpoint.exec({ version: 4, observations: [{ ...detailObservation(), deviceContext }, { ...imageObservation(), eventId: 'invalid-device', deviceContext: invalid }] }, viewer, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		expect(f.submitImpressions).not.toHaveBeenCalled();
	});

	/** Oracle: the public v4 migration ends both old observation protocols before invoking the service; legacy events retain their accepted input shape. */
	test.each([
		{ version: 2, observations: [{ eventId: 'v2-series', snapshotId: 'snapshot-a', entryId: 'entry-a', sequence: 0, elapsedMs: 0, visibleArea: 7, availableArea: 19, documentVisible: true, ended: false }] },
		{ version: 3, observations: [detailObservation()] },
	])('requires refresh for old observation version $version before service effects', async payload => {
		const f = fixture();
		await expect(f.endpoint.exec(payload, viewer, null)).rejects.toMatchObject({ code: 'REFRESH_REQUIRED' });
		expect(f.submitImpressions).not.toHaveBeenCalled();
	});

	test('retains the legacy event payload without accepting device context', async () => {
		const f = fixture();
		const event = { eventId: 'legacy-event', snapshotId: 'snapshot-a', entryId: 'entry-a' };
		await expect(f.endpoint.exec({ events: [event] }, viewer, null)).resolves.toBeUndefined();
		expect(f.submitImpressions).toHaveBeenCalledWith(viewer, { events: [event] });
		f.submitImpressions.mockClear();
		await expect(f.endpoint.exec({ events: [{ ...event, deviceContext }] }, viewer, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		expect(f.submitImpressions).not.toHaveBeenCalled();
	});

	test('keeps account-write authentication and the existing Hanami timeline policy', () => {
		expect(meta).toMatchObject({ requireCredential: true, kind: 'write:account', requiredRolePolicy: 'hanamiTlAvailable' });
	});

	test.each([
		viewportObservation(), detailObservation(), imageObservation(),
		{ ...interactionIdentity, kind: 'link_copy' }, { ...interactionIdentity, kind: 'share' },
		replyObservation(), { ...replyObservation(), action: 'quote' },
		...['follow', 'mute', 'block', 'report'].map(action => ({ ...interactionIdentity, kind: 'action', action })),
	])('accepts the declared $kind/$action payload and strips browser credentials before forwarding', async observation => {
		const f = fixture();
		const payload = { version: 4, observations: [observation] };
		await expect(f.endpoint.exec({ ...payload, i: 'synthetic-browser-credential' }, viewer, null)).resolves.toBeUndefined();
		expect(f.submitImpressions).toHaveBeenCalledWith(viewer, payload);
		expect(JSON.stringify(f.submitImpressions.mock.calls)).not.toContain('synthetic-browser-credential');
	});

	test('preserves batch order and both event identifiers for an independent image operation and a viewport series', async () => {
		const f = fixture();
		const payload = { version: 4, observations: [viewportObservation(), { ...imageObservation(), eventId: 'image-open-a' }] };
		f.submitImpressions.mockResolvedValue({ accepted: 2, duplicates: 0 });
		await expect(f.endpoint.exec(payload, viewer, null)).resolves.toBeUndefined();
		expect(f.submitImpressions).toHaveBeenCalledWith(viewer, payload);
	});

	test.each([-840, 0, 840])('accepts an operation offset of %i minutes', async utcOffsetMinutes => {
		const f = fixture();
		await f.endpoint.exec({ version: 4, observations: [{ ...detailObservation(), utcOffsetMinutes }] }, viewer, null);
		expect(f.submitImpressions).toHaveBeenCalledTimes(1);
	});

	test.each([
		{ version: 5 }, { version: '4' }, { observations: [] },
		{ observations: Array.from({ length: 101 }, (_, index) => ({ ...detailObservation(), eventId: `event-${index}` })) },
		{ viewerId: 'another-viewer' }, { events: [] }, { extraFlag: true },
	])('rejects an invalid v4 envelope %p before invoking the service', async invalid => {
		const f = fixture();
		await expect(f.endpoint.exec({ version: 4, observations: [detailObservation()], ...invalid }, viewer, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		expect(f.submitImpressions).not.toHaveBeenCalled();
	});

	/** Oracle: §1 の union は許可された kind ごとの field だけを受け付ける。verified/sourceRowId、主体、本文と未定義の追加項目はブラウザが指定できない。 */
	test.each([
		{ ...detailObservation(), kind: 'dm' },
		{ ...detailObservation(), kind: 'reaction' },
		{ ...detailObservation(), eventId: '' },
		{ ...detailObservation(), eventId: 'x'.repeat(129) },
		{ ...detailObservation(), snapshotId: '' },
		{ ...detailObservation(), entryId: '' },
		{ ...detailObservation(), noteId: '' },
		{ ...detailObservation(), occurredAtMs: -1 },
		{ ...detailObservation(), occurredAtMs: 1.5 },
		{ ...detailObservation(), occurredAtMs: Number.MAX_SAFE_INTEGER + 1 },
		...[-841, 841, 0.5, '540', null, Infinity, NaN].map(utcOffsetMinutes => ({ ...detailObservation(), utcOffsetMinutes })),
		{ ...detailObservation(), viewerId: 'another-viewer' },
		{ ...detailObservation(), verified: true },
		{ ...detailObservation(), sourceRowId: 'claimed-row' },
		{ ...detailObservation(), actorId: 'alice' },
		{ ...detailObservation(), targetId: 'bob' },
		{ ...detailObservation(), extraNumber: 1 },
		{ ...detailObservation(), extraFlag: true },
		{ ...detailObservation(), i: 'synthetic-event-credential' },
		{ ...detailObservation(), comment: 'synthetic-private-report-comment' },
		{ ...detailObservation(), fileId: 'image-a' },
		{ ...detailObservation(), evidenceNoteId: 'reply-a' },
		{ ...detailObservation(), kind: 'image_open' },
		{ ...imageObservation(), fileId: '' },
		{ ...detailObservation(), kind: 'action', action: 'reply' },
		{ ...replyObservation(), evidenceNoteId: '' },
		{ ...replyObservation(), action: 'follow' },
		{ ...detailObservation(), kind: 'action', action: 'less' },
		{ ...detailObservation(), kind: 'action', action: 'reaction' },
		{ ...viewportObservation(), focused: 'true' },
		{ ...viewportObservation(), activityAgeMs: -1 },
		{ ...viewportObservation(), scrollIdleMs: 0.5 },
		{ ...viewportObservation(), visibleArea: Infinity },
		{ ...viewportObservation(), availableArea: NaN },
	])('rejects an invalid record %p without partially forwarding its valid neighbor', async invalid => {
		const f = fixture();
		await expect(f.endpoint.exec({ version: 4, observations: [detailObservation(), invalid] }, viewer, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		expect(f.submitImpressions).not.toHaveBeenCalled();
	});

	test.each(['noteId', 'kind', 'occurredAtMs', 'utcOffsetMinutes'])('requires the common %s field', async field => {
		const f = fixture();
		const observation: Record<string, unknown> = detailObservation();
		delete observation[field];
		await expect(f.endpoint.exec({ version: 4, observations: [observation] }, viewer, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		expect(f.submitImpressions).not.toHaveBeenCalled();
	});

	/** Oracle: 2026-11-10 公開204契約。保存成功時は本文も件数も公開しない。競合と内部障害は既存 error schema に従い、内部 body/token を漏らさない。 */
	test('declares no response body in the public schema', () => {
		expect(meta).not.toHaveProperty('res');
	});

	test.each<[Error, string, number]>([
		[new HanamiPlatformError('EVENT_CONFLICT'), 'EVENT_CONFLICT', 409],
		[new HanamiPlatformError('INVALID_REQUEST'), 'INVALID_REQUEST', 400],
		[new Error('synthetic-private-body-and-token'), 'UNAVAILABLE', 503],
	])('maps a service failure to the public %s error', async (cause, code, httpStatusCode) => {
		const f = fixture();
		f.submitImpressions.mockRejectedValue(cause);
		const result = await f.endpoint.exec({ version: 4, observations: [detailObservation()] }, viewer, null).catch((error: unknown) => error);
		expect(result).toMatchObject({ code, httpStatusCode });
		expect(JSON.stringify(result)).not.toContain('synthetic-private-body-and-token');
	});
});

/** Oracle: §4 現在の offset は任意で、既存 client は省略可能。API 入口は境界整数だけを受け付け、その値を変えず推薦へ渡す。 */
describe('Hanami recommendation time context', () => {
	/** Oracle: 端末文脈契約（2026-11-09）§1。推薦contextは全enum値を変換せず転送し、省略した旧requestへunknownなどを注入しない。 */
	test.each([
		deviceContext,
		{ deviceClass: 'tablet', viewportClass: 'medium', primaryPointer: 'fine' },
		{ deviceClass: 'desktop', viewportClass: 'wide', primaryPointer: 'none' },
		{ deviceClass: 'unknown', viewportClass: 'unknown', primaryPointer: 'unknown' },
	])('forwards recommendation device context %p exactly', async deviceContext => {
		const f = fixture();
		await f.recommendations.exec({ deviceContext, withFiles: true }, viewer, null);
		expect(f.getRecommendations).toHaveBeenCalledWith(viewer, expect.objectContaining({ deviceContext, withFiles: true }));
	});

	test('keeps absent context absent for old recommendation clients', async () => {
		const f = fixture();
		await f.recommendations.exec({}, viewer, null);
		expect(f.getRecommendations.mock.calls[0][1]).not.toHaveProperty('deviceContext');
	});

	test.each(invalidDeviceContexts)('rejects malformed recommendation device context %p before the service', async deviceContext => {
		const f = fixture();
		await expect(f.recommendations.exec({ deviceContext }, viewer, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		expect(f.getRecommendations).not.toHaveBeenCalled();
	});

	test.each([-840, 0, 540, 840])('forwards utcOffsetMinutes=%i with the existing page conditions', async utcOffsetMinutes => {
		const f = fixture();
		await f.recommendations.exec({ utcOffsetMinutes, withFiles: true }, viewer, null);
		expect(f.getRecommendations).toHaveBeenCalledWith(viewer, expect.objectContaining({ utcOffsetMinutes, withFiles: true }));
	});

	test.each([-841, 841, 0.5, '540', null, Infinity, NaN])('rejects invalid recommendation offset %p', async utcOffsetMinutes => {
		const f = fixture();
		await expect(f.recommendations.exec({ utcOffsetMinutes }, viewer, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		expect(f.getRecommendations).not.toHaveBeenCalled();
	});
});
