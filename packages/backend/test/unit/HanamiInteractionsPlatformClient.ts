import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import type { Config } from '@/config.js';
import type { MiUser } from '@/models/_.js';
import type { MiLocalUser } from '@/models/User.js';
import { IdService } from '@/core/IdService.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { HanamiPlatformClient } from '@/core/hanamifeed/HanamiPlatformClient.js';
import { HanamiRecommendationsService } from '@/core/hanamifeed/HanamiRecommendationsService.js';
import type { HanamiPlatformContract } from '@/core/hanamifeed/HanamiPlatformWire.js';
import ImpressionsEndpoint from '@/server/api/endpoints/hanami-impressions.js';
import RecommendationsEndpoint from '@/server/api/endpoints/notes/hanami-recommendations.js';
import { repository, type TestRow } from '../utils/HanamiRecommendationsFixture.js';
import { detailObservation, imageObservation, interactionAck, interactionIdentity, viewportObservation } from '../utils/HanamiInteractionsFixture.js';

const now = interactionIdentity.occurredAtMs;
const viewer = { id: 'alice', host: null, token: 'synthetic-private-user-token' } as unknown as MiUser;
const settings = { url: 'http://platform.example.test', keyId: 'interaction-test', signingKey: 'synthetic-interaction-signing-key', sourceId: 'local-misskey', generation: 7 };
const ids = new IdService({ id: 'aid' } as Config);
type Action = 'reply' | 'quote' | 'follow' | 'mute' | 'block' | 'report';
const actionRepository: Record<Action, string> = { reply: 'MiNote', quote: 'MiNote', follow: 'MiFollowing', mute: 'MiMuting', block: 'MiBlocking', report: 'MiAbuseUserReport' };

function fixture() {
	const rows: Record<string, TestRow[]> = {
		MiUser: [{ id: 'alice', host: null, isSuspended: false, isDeleted: false }],
		MiFollowing: [], MiBlocking: [], MiMuting: [], MiRenoteMuting: [], MiFollowRequest: [], MiAbuseUserReport: [],
		MiUserProfile: [{ userId: 'alice', mutedInstances: [] }], MiMeta: [{ id: 'x', blockedHosts: [] }],
		MiNote: [{ id: 'note-a', userId: 'author-a', userHost: null, visibility: 'public', text: 'synthetic-private-target-body', fileIds: ['image-a'], attachedFileTypes: ['image/png'] }],
		MiDriveFile: [{ id: 'image-a', type: 'image/png', name: 'synthetic-private-filename' }],
	};
	const barriers: TestRow[] = [];
	let committed = false;
	const lookup = (target: { name: string }) => {
		if (!(target.name in rows)) throw new Error(`Unexpected repository ${target.name}`);
		return repository(() => rows[target.name]);
	};
	const insert = jest.fn<(target: { name: string }, row: TestRow) => Promise<unknown>>().mockImplementation(async (target, row) => {
		expect(target.name).toBe('MiHanamiReadBarrier');
		barriers.push({ ...row });
		return {};
	});
	const manager = {
		find: (target: { name: string }, options?: { where?: unknown }) => lookup(target).find(options),
		findBy: (target: { name: string }, where: unknown) => lookup(target).findBy(where),
		findOne: (target: { name: string }, options?: { where?: unknown }) => lookup(target).findOne(options),
		findOneBy: (target: { name: string }, where: unknown) => lookup(target).findOneBy(where),
		insert, delete: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({}),
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
		return { ok: true, json: async () => interactionAck };
	});
	const dependencies = [{ id: 'aid', userAgent: 'local interaction contract test', hanamiPlatform: settings }, { transaction }, { send }] as unknown as ConstructorParameters<typeof HanamiPlatformClient>;
	const client = new HanamiPlatformClient(...dependencies);
	const request = (observations: Record<string, unknown>[]) => client.request(viewer, '/internal/v1/observations', { version: 4, observations } as unknown as HanamiPlatformContract['/internal/v1/observations']['request']);
	return { client, dependencies, request, rows, barriers, insert, send, transaction };
}

function operation(f: ReturnType<typeof fixture>, action: Action, createdAtMs = now) {
	const rowId = ids.gen(createdAtMs);
	const note = { id: rowId, userId: 'alice', visibility: 'public', replyId: null, renoteId: null, text: null, cw: null, hasPoll: false, fileIds: [] };
	const row: TestRow = {
		reply: { ...note, replyId: 'note-a', text: 'synthetic-private-reply-body' },
		quote: { ...note, renoteId: 'note-a', text: 'synthetic-private-quote-body' },
		follow: { id: rowId, followerId: 'alice', followeeId: 'author-a' },
		mute: { id: rowId, muterId: 'alice', muteeId: 'author-a', expiresAt: null },
		block: { id: rowId, blockerId: 'alice', blockeeId: 'author-a' },
		report: { id: rowId, reporterId: 'alice', targetUserId: 'author-a', comment: 'synthetic-private-report-comment', moderationNote: 'synthetic-private-moderation-note' },
	}[action];
	f.rows[actionRepository[action]].push(row);
	const observation: Record<string, unknown> = { ...interactionIdentity, kind: 'action', action };
	if (action === 'reply' || action === 'quote') observation.evidenceNoteId = rowId;
	return { row, observation };
}

afterEach(() => { jest.restoreAllMocks(); });

/** Oracle: window-api §§4/5. Window and feedback records pass through signing without invented action attestations; actual action records retain their existing database evidence. */
describe('Hanami signed window metadata', () => {
	test.each(['window', 'feedback', 'action'] as const)('preserves %s collection metadata in the signed body', async kind => {
		jest.spyOn(Date, 'now').mockReturnValue(now);
		const f = fixture();
		const record = kind === 'action' ? operation(f, 'reply').observation : kind === 'feedback'
			? { ...interactionIdentity, kind: 'feedback', eventId: 'saved-feedback' }
			: { ...interactionIdentity, kind: 'window', eventId: 'window-a', phase: 'open', displayPosition: 1 };
		const metadata = { windowId: 'window-a', windowSequence: kind === 'window' ? 0 : 1, windowElapsedMs: 0 };
		await expect(f.request([{ ...record, ...metadata }])).resolves.toEqual(interactionAck);
		const options = f.send.mock.calls[0][1] as { body: string; headers: Record<string, string> };
		const body = JSON.parse(options.body) as { request: { observations: Record<string, unknown>[] } };
		expect(body.request.observations[0]).toMatchObject({ ...record, ...metadata });
		if (kind === 'action') expect(body.request.observations[0]).toMatchObject({ verified: true, sourceRowId: expect.any(String) });
		else {
			expect(body.request.observations[0]).not.toHaveProperty('verified');
			expect(body.request.observations[0]).not.toHaveProperty('sourceRowId');
		}
		const headers = options.headers;
		const expected = createHmac('sha256', settings.signingKey).update(`hanami-internal-v1\n${settings.keyId}\nPOST\n/internal/v1/observations\n${headers['X-Hanami-Timestamp']}\n${headers['X-Hanami-Nonce']}\n`).update(options.body).digest('hex');
		expect(headers['X-Hanami-Signature']).toBe(expected);
	});

	test.each(['windowId', 'windowSequence', 'windowElapsedMs'])('rejects incomplete window metadata before the transaction: %s', async missing => {
		jest.spyOn(Date, 'now').mockReturnValue(now);
		const f = fixture();
		const record: Record<string, unknown> = { ...detailObservation(), windowId: 'window-a', windowSequence: 1, windowElapsedMs: 0 };
		delete record[missing];
		await expect(f.request([record])).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
		expect(f.transaction).not.toHaveBeenCalled();
		expect(f.send).not.toHaveBeenCalled();
	});
});

/** Oracle: 推薦操作観測契約（2026-11-08）§1/2。ブラウザ操作の成功申告は成立事実ではなく、本人・対象・有効時刻が実 DB row と一致した action だけを署名する。repository double は選択のみを行い、実 Postgres の atomicity/CDC 互換は別のローカル検証が必要。 */
describe('Hanami interaction database attestations', () => {
	/** Oracle: v2/v3 migration rejection precedes database reads, read-barrier insertion, and transport signing. The signed client is also an entry point used by non-HTTP callers. */
	test.each([2, 3])('requires refresh for old observation version %i before transaction or send', async version => {
		jest.spyOn(Date, 'now').mockReturnValue(now);
		const f = fixture();
		const observation = version === 2
			? { eventId: 'old-series', snapshotId: 'snapshot-a', entryId: 'entry-a', sequence: 0, elapsedMs: 0, visibleArea: 7, availableArea: 19, documentVisible: true, ended: false }
			: viewportObservation();
		const payload = { version, observations: [observation] } as unknown as HanamiPlatformContract['/internal/v1/observations']['request'];
		const result = await f.client.request(viewer, '/internal/v1/observations', payload).catch((error: unknown) => error);
		expect(f.transaction).not.toHaveBeenCalled();
		expect(f.insert).not.toHaveBeenCalled();
		expect(f.send).not.toHaveBeenCalled();
		expect(result).toMatchObject({ code: 'REFRESH_REQUIRED' });
	});

	test.each<Action>(['reply', 'quote', 'follow', 'mute', 'block', 'report'])('attests a persisted %s with the authenticated actor and source row ID only', async action => {
		jest.spyOn(Date, 'now').mockReturnValue(now);
		const f = fixture();
		const { row, observation } = operation(f, action);
		await expect(f.request([observation])).resolves.toEqual(interactionAck);
		const [, options] = f.send.mock.calls[0] as [string, { body: string }];
		const envelope = JSON.parse(options.body);
		expect(envelope.viewer).toEqual({ id: 'alice', host: null });
		expect(envelope.request).toEqual({ version: 4, observations: [{ ...observation, verified: true, sourceRowId: row.id }] });
		expect(f.barriers).toHaveLength(1);
		expect(f.barriers[0]).toMatchObject({ viewerId: 'alice', nonce: envelope.barrier.nonce });
		expect(Object.keys(f.barriers[0]).sort()).toEqual(['createdAt', 'generation', 'nonce', 'sourceId', 'viewerId']);
		expect(options.body).not.toContain('synthetic-private-');
	});

	test.each<Action>(['reply', 'quote', 'follow', 'mute', 'block', 'report'])('rejects %s when the successful-looking browser claim has no committed row', async action => {
		jest.spyOn(Date, 'now').mockReturnValue(now);
		const f = fixture();
		const { observation } = operation(f, action);
		f.rows[actionRepository[action]] = f.rows[actionRepository[action]].filter(row => row.id === 'note-a');
		if (action === 'follow') f.rows.MiFollowRequest.push({ id: ids.gen(now), followerId: 'alice', followeeId: 'author-a' });
		await expect(f.request([observation])).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
		expect(f.send).not.toHaveBeenCalled();
		expect(f.insert).not.toHaveBeenCalled();
	});

	test.each<[Action, string, string]>([
		['reply', 'userId', 'someone-else'], ['reply', 'replyId', 'another-note'],
		['quote', 'userId', 'someone-else'], ['quote', 'renoteId', 'another-note'],
		['follow', 'followerId', 'someone-else'], ['follow', 'followeeId', 'another-author'],
		['mute', 'muterId', 'someone-else'], ['mute', 'muteeId', 'another-author'],
		['block', 'blockerId', 'someone-else'], ['block', 'blockeeId', 'another-author'],
		['report', 'reporterId', 'someone-else'], ['report', 'targetUserId', 'another-author'],
	])('rejects %s whose row has mismatching %s', async (action, field, value) => {
		jest.spyOn(Date, 'now').mockReturnValue(now);
		const f = fixture();
		const { row, observation } = operation(f, action);
		row[field] = value;
		await expect(f.request([observation])).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
		expect(f.send).not.toHaveBeenCalled();
	});

	test.each<Action>(['reply', 'quote', 'follow', 'mute', 'block', 'report'])('does not use an older %s row to prove a new operation', async action => {
		jest.spyOn(Date, 'now').mockReturnValue(now);
		const f = fixture();
		const { observation } = operation(f, action, now - 30_001);
		await expect(f.request([observation])).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
		expect(f.send).not.toHaveBeenCalled();
	});

	test('permits a report at the attribution boundary and never forwards its comment', async () => {
		jest.spyOn(Date, 'now').mockReturnValue(now);
		const f = fixture();
		const { row, observation } = operation(f, 'report', now - 30_000);
		await f.request([observation]);
		const [, options] = f.send.mock.calls[0] as [string, { body: string }];
		expect(JSON.parse(options.body).request.observations[0].sourceRowId).toBe(row.id);
		expect(options.body).not.toContain('synthetic-private-report-comment');
	});

	/** Oracle: ユーザー要求「DMまでは踏み込まない」。対象が public note でも、本人の返信・引用自体が specified なら観測対象外。home/followers は DM に含めない。 */
	test.each(['reply', 'quote'] as const)('rejects a specified %s even when its author and public target match', async action => {
		jest.spyOn(Date, 'now').mockReturnValue(now);
		const f = fixture();
		const { row, observation } = operation(f, action);
		Object.assign(row, { visibility: 'specified', visibleUserIds: ['author-a'] });
		await expect(f.request([observation])).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
		expect(f.insert).not.toHaveBeenCalled();
		expect(f.send).not.toHaveBeenCalled();
	});

	test.each<['reply' | 'quote', 'home' | 'followers']>([
		['reply', 'home'], ['reply', 'followers'], ['quote', 'home'], ['quote', 'followers'],
	])('permits a persisted %s with %s visibility', async (action, visibility) => {
		jest.spyOn(Date, 'now').mockReturnValue(now);
		const f = fixture();
		const { row, observation } = operation(f, action);
		row.visibility = visibility;
		await expect(f.request([observation])).resolves.toEqual(interactionAck);
		expect(f.send).toHaveBeenCalledTimes(1);
	});

	test('rejects a pure renote claimed as a quote when no content exists', async () => {
		jest.spyOn(Date, 'now').mockReturnValue(now);
		const f = fixture();
		const { row, observation } = operation(f, 'quote');
		Object.assign(row, { text: null });
		await expect(f.request([observation])).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
		expect(f.send).not.toHaveBeenCalled();
	});

	/** Oracle: Misskey の isQuote 契約は非 null の text/cw、reply、poll、添付のいずれかを引用とする。空文字も非 null として成立する。 */
	test.each([{ text: '' }, { cw: 'content warning' }, { hasPoll: true }, { fileIds: ['file-a'] }, { replyId: 'another-note' }])('accepts a quote with the existing content condition %p', async content => {
		jest.spyOn(Date, 'now').mockReturnValue(now);
		const f = fixture();
		const { row, observation } = operation(f, 'quote');
		Object.assign(row, { text: null, ...content });
		await expect(f.request([observation])).resolves.toEqual(interactionAck);
	});

	test('rejects a mute that expired at the current time even after a successful API response', async () => {
		jest.spyOn(Date, 'now').mockReturnValue(now);
		const f = fixture();
		const { row, observation } = operation(f, 'mute');
		row.expiresAt = new Date(now);
		await expect(f.request([observation])).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
		expect(f.send).not.toHaveBeenCalled();
	});

	test('keeps a valid mute or block event even though its target is no longer readable', async () => {
		jest.spyOn(Date, 'now').mockReturnValue(now);
		for (const action of ['mute', 'block'] as const) {
			const f = fixture();
			const { observation } = operation(f, action);
			await expect(f.request([observation])).resolves.toEqual(interactionAck);
		}
	});

	test('rejects the entire batch before a barrier or send when a neighboring action did not happen', async () => {
		jest.spyOn(Date, 'now').mockReturnValue(now);
		const f = fixture();
		const { observation } = operation(f, 'reply');
		f.rows.MiNote = f.rows.MiNote.filter(row => row.id === 'note-a');
		await expect(f.request([detailObservation(), { ...observation, eventId: 'uncommitted-action' }])).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
		expect(f.insert).not.toHaveBeenCalled();
		expect(f.send).not.toHaveBeenCalled();
	});
});

/** Oracle: §1 の image_open は entry の実画像であることを確認する。v4 の未知属性・非有限値・範囲外時刻を内部署名で信用へ昇格させない。 */
describe('Hanami v4 signed observation boundary', () => {
	/** Oracle: 端末文脈契約（2026-11-09）§1/4。公開schema→実service→署名clientを通した全v4種別のcontextは厳密に保持する。成立証拠の検査は既存DB境界doubleで、端末情報を証拠へ昇格させない。本文なし204契約（2026-11-10）では保存成功時の公開応答に内部件数を含めない。 */
	test.each(['viewport', 'detail_open', 'image_open', 'link_copy', 'share', 'reply', 'quote', 'follow', 'mute', 'block', 'report'] as const)('forwards the exact device context for %s through public validation and signing', async kind => {
		jest.spyOn(Date, 'now').mockReturnValue(now);
		const f = fixture();
		const service = new HanamiRecommendationsService(...[f.client, {}] as unknown as ConstructorParameters<typeof HanamiRecommendationsService>);
		const endpoint = new ImpressionsEndpoint(service);
		const deviceContext = { deviceClass: 'mobile', viewportClass: 'medium', primaryPointer: 'fine' };
		let observation: Record<string, unknown>;
		let sourceRowId: unknown;
		if (kind in actionRepository) {
			const action = operation(f, kind as Action);
			observation = action.observation;
			sourceRowId = action.row.id;
		} else observation = kind === 'viewport' ? viewportObservation() : kind === 'image_open' ? imageObservation() : { ...detailObservation(), kind };
		const record = { ...observation, deviceContext };
		await expect(endpoint.exec({ version: 4, observations: [record] }, viewer as MiLocalUser, null)).resolves.toBeUndefined();
		const [, options] = f.send.mock.calls[0] as [string, { body: string }];
		expect(JSON.parse(options.body).request).toStrictEqual({ version: 4, observations: [{ ...record, ...(sourceRowId === undefined ? {} : { verified: true, sourceRowId }) }] });
	});

	/** Oracle: §1の内部validationもcontextを検査する。公開schemaを通さない内部呼出しでも不正contextを署名できず、バッチ隣接record・read barrierに作用を残さない。 */
	test.each([
		null, [], 'mobile', 1, true, {},
		{ deviceClass: 'mobile', viewportClass: 'compact' },
		{ deviceClass: 'mobile', primaryPointer: 'coarse' },
		{ viewportClass: 'compact', primaryPointer: 'coarse' },
		...['deviceClass', 'viewportClass', 'primaryPointer'].flatMap(key => [null, 1, [], 'unsupported'].map(value => ({ deviceClass: 'mobile', viewportClass: 'compact', primaryPointer: 'coarse', [key]: value }))),
		{ deviceClass: 'mobile', viewportClass: 'compact', primaryPointer: 'coarse', userAgent: 'synthetic-private-UA' },
	])('rejects invalid internal device context %p before signing a neighboring valid record', async deviceContext => {
		jest.spyOn(Date, 'now').mockReturnValue(now);
		const f = fixture();
		await expect(f.request([detailObservation(), { ...imageObservation(), eventId: 'malformed-device', deviceContext }])).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
		expect(f.insert).not.toHaveBeenCalled();
		expect(f.send).not.toHaveBeenCalled();
	});

	/** Oracle: §1の旧requestは省略を保持し、新requestはrequest contextを署名対象のbodyへそのまま接続する。推薦pageの描画は本試験の対象外なので空pageで境界だけを通す。 */
	test.each([undefined, { deviceClass: 'desktop', viewportClass: 'compact', primaryPointer: 'coarse' }, { deviceClass: 'unknown', viewportClass: 'unknown', primaryPointer: 'unknown' }])('preserves optional recommendation context %p from public endpoint into the signed body', async deviceContext => {
		const f = fixture();
		const remote = { kind: 'page', page: { items: [], nextCursor: null, snapshotId: 'snapshot-device', revision: 0, validationToken: 'local-validation' } };
		f.send.mockResolvedValue({ ok: true, json: async () => remote });
		const service = new HanamiRecommendationsService(...[f.client, { packReferences: async () => [] }] as unknown as ConstructorParameters<typeof HanamiRecommendationsService>);
		const endpoint = new RecommendationsEndpoint(service);
		const context = deviceContext === undefined ? {} : { deviceContext };
		await endpoint.exec({ ...context, withFiles: true }, viewer as MiLocalUser, null);
		const [, options] = f.send.mock.calls[0] as [string, { body: string }];
		expect(JSON.parse(options.body).request).toStrictEqual({ ...context, limit: 20, refresh: false, imageFilter: 'any', withFiles: true });
	});

	/** Oracle: 公開 JSON Schema の maxLength:128 は Unicode code point 数。65/128 個の絵文字は有効な eventId なので、後段の署名 client が UTF-16 code unit 数を理由に拒否してはならない。本文なし204契約（2026-11-10）では保存成功時の公開応答に内部件数を含めない。 */
	test.each([65, 128])('preserves an event ID of %i emoji from the public schema through the signed client', async count => {
		jest.spyOn(Date, 'now').mockReturnValue(now);
		const f = fixture();
		const service = new HanamiRecommendationsService(...[f.client, {}] as unknown as ConstructorParameters<typeof HanamiRecommendationsService>);
		const endpoint = new ImpressionsEndpoint(service);
		const eventId = '😀'.repeat(count);
		const payload = { version: 4, observations: [{ ...detailObservation(), eventId }] };
		await expect(endpoint.exec(payload, viewer as MiLocalUser, null)).resolves.toBeUndefined();
		expect(f.send).toHaveBeenCalledTimes(1);
		const [, options] = f.send.mock.calls[0] as [string, { body: string }];
		expect(JSON.parse(options.body).request.observations[0].eventId).toBe(eventId);
	});

	test('permits an attached image and strips no independent discrete operation after long viewport time', async () => {
		jest.spyOn(Date, 'now').mockReturnValue(now);
		const f = fixture();
		const observations = [{ ...viewportObservation(), elapsedMs: 3_600_000 }, { ...imageObservation(), eventId: 'image-open' }];
		f.send.mockResolvedValue({ ok: true, json: async () => ({ accepted: 2, duplicates: 0 }) });
		await f.request(observations);
		const [, options] = f.send.mock.calls[0] as [string, { body: string }];
		expect(JSON.parse(options.body).request.observations).toEqual(observations);
	});

	test.each(['not-attached', 'not-image', 'missing-file'])('rejects an image operation whose file is %s', async invalid => {
		jest.spyOn(Date, 'now').mockReturnValue(now);
		const f = fixture();
		if (invalid === 'not-attached') f.rows.MiNote[0].fileIds = [];
		if (invalid === 'not-image') f.rows.MiDriveFile[0].type = 'application/pdf';
		if (invalid === 'missing-file') f.rows.MiDriveFile = [];
		await expect(f.request([imageObservation()])).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
		expect(f.send).not.toHaveBeenCalled();
	});

	test.each([
		{ ...detailObservation(), verified: true },
		{ ...detailObservation(), sourceRowId: 'forged' },
		{ ...detailObservation(), utcOffsetMinutes: 841 },
		{ ...detailObservation(), occurredAtMs: now + 30_001 },
		{ ...detailObservation(), occurredAtMs: now - 1_800_001 },
		{ ...viewportObservation(), visibleArea: Infinity },
		{ ...viewportObservation(), activityAgeMs: NaN },
	])('rejects invalid v4 input before signing %p', async observation => {
		jest.spyOn(Date, 'now').mockReturnValue(now);
		const f = fixture();
		await expect(f.request([observation])).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
		expect(f.insert).not.toHaveBeenCalled();
		expect(f.send).not.toHaveBeenCalled();
	});

	test('signs the v4 path, authenticated viewer and committed barrier over real HTTP', async () => {
		jest.spyOn(Date, 'now').mockReturnValue(now);
		const received: { path?: string; body: Buffer; headers: Record<string, string | string[] | undefined> }[] = [];
		const server = createServer(async (req, res) => {
			const chunks: Buffer[] = [];
			for await (const chunk of req) chunks.push(Buffer.from(chunk));
			received.push({ path: req.url, body: Buffer.concat(chunks), headers: req.headers });
			res.setHeader('content-type', 'application/json');
			res.end(JSON.stringify({ ...interactionAck, privateMarker: 'synthetic-response-secret' }));
		});
		server.listen(0, '127.0.0.1');
		await once(server, 'listening');
		try {
			const address = server.address();
			if (!address || typeof address === 'string') throw new Error('Missing local address');
			const f = fixture();
			f.dependencies[0] = { ...f.dependencies[0], hanamiPlatform: { ...settings, url: `http://127.0.0.1:${address.port}` } } as Config;
			f.dependencies[2] = new HttpRequestService(f.dependencies[0]);
			const client = new HanamiPlatformClient(...f.dependencies);
			const payload = { version: 4, observations: [{ ...detailObservation(), eventId: '表示😀', deviceContext: { deviceClass: 'mobile', viewportClass: 'compact', primaryPointer: 'coarse' } }] } as unknown as HanamiPlatformContract['/internal/v1/observations']['request'];
			await expect(client.request(viewer, '/internal/v1/observations', payload)).resolves.toEqual(interactionAck);
			expect(received).toHaveLength(1);
			const wire = received[0];
			const body = JSON.parse(wire.body.toString('utf8'));
			expect(wire.path).toBe('/internal/v1/observations');
			expect(body.viewer).toEqual({ id: 'alice', host: null });
			expect(body.request).toEqual(payload);
			expect(f.barriers[0]).toMatchObject({ nonce: wire.headers['x-hanami-nonce'], viewerId: 'alice' });
			const prefix = `hanami-internal-v1\ninteraction-test\nPOST\n/internal/v1/observations\n${wire.headers['x-hanami-timestamp']}\n${wire.headers['x-hanami-nonce']}\n`;
			expect(wire.headers['x-hanami-signature']).toBe(createHmac('sha256', settings.signingKey).update(prefix).update(wire.body).digest('hex'));
			expect(wire.headers.authorization).toBeUndefined();
			expect(wire.body.toString('utf8')).not.toContain('synthetic-private-');
		} finally {
			server.closeAllConnections();
			await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
		}
	});
});
