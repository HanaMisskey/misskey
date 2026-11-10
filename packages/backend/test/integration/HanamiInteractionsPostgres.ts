import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { DataSource } from 'typeorm';
import type { EntityTarget, ObjectLiteral } from 'typeorm';
import type { Config } from '@/config.js';
import { IdService } from '@/core/IdService.js';
import { HanamiPlatformClient } from '@/core/hanamifeed/HanamiPlatformClient.js';
import type { HanamiPlatformContract } from '@/core/hanamifeed/HanamiPlatformWire.js';
import { MiAbuseUserReport, MiBlocking, MiDriveFile, MiFollowing, MiFollowRequest, MiMeta, MiMuting, MiNote, MiUser, MiUserProfile } from '@/models/_.js';
import { entities } from '@/postgres.js';

const databaseUrl = process.env.HANAMI_INTERACTIONS_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;
const tables = ['user', 'user_profile', 'meta', 'note', 'following', 'follow_request', 'blocking', 'muting', 'renote_muting', 'drive_file', 'abuse_user_report', 'hanami_read_barrier'];
const schema = `hanami_interactions_test_${randomBytes(8).toString('hex')}`;
const ids = new IdService({ id: 'aid' } as Config);
const viewer = { id: 'interactionviewer', host: null } as MiUser;
const targetNoteId = 'interactiontarget';
const targetAuthorId = 'interactionauthor';
const otherUserId = 'interactionother';
const ack = { accepted: 1, duplicates: 0 };
type Action = 'reply' | 'quote' | 'follow' | 'mute' | 'block' | 'report';

/** Oracle: 推薦操作観測契約（2026-11-08）§1/2/6。実 Misskey 元 DB の表構造と TypeORM を通し、保存された本人の操作だけが署名されることを検証する。HANAMI_INTERACTIONS_TEST_DATABASE_URL を明示した loopback/source-postgres だけに接続し、一時 schema のみ作成・破棄する。public のデータ、publication、volume は変更しない。API/CDC/ranking はこの試験の範囲外。 */
integration('Hanami interactions against source PostgreSQL', () => {
	let control: DataSource;
	let db: DataSource;
	let created = false;
	let now: number;
	let client: HanamiPlatformClient;
	let send: ReturnType<typeof jest.fn<(...args: unknown[]) => Promise<unknown>>>;

	async function insert(target: EntityTarget<ObjectLiteral>, values: ObjectLiteral) {
		const row = { ...values };
		for (const column of db.getMetadata(target).columns) {
			if (column.propertyName in row || column.isNullable || column.default !== undefined || column.isGenerated) continue;
			if (column.isArray) row[column.propertyName] = [];
			else if (column.enum) row[column.propertyName] = column.enum[0];
			else if (column.type === Boolean || column.type === 'boolean') row[column.propertyName] = false;
			else if (column.type === Number || ['integer', 'smallint', 'bigint', 'double precision', 'real', 'numeric'].includes(String(column.type))) row[column.propertyName] = 0;
			else if (column.type === Date || String(column.type).includes('timestamp')) row[column.propertyName] = new Date(now);
			else if (['json', 'jsonb'].includes(String(column.type))) row[column.propertyName] = {};
			else row[column.propertyName] = `synthetic-${column.propertyName}`;
		}
		await db.manager.insert(target, row);
		return row;
	}

	const identity = () => ({ eventId: 'interaction-a', snapshotId: 'snapshot-a', entryId: 'entry-a', noteId: targetNoteId, occurredAtMs: now, utcOffsetMinutes: 540 });
	const request = (observations: ObjectLiteral[]) => client.request(viewer, '/internal/v1/observations', { version: 4, observations } as unknown as HanamiPlatformContract['/internal/v1/observations']['request']);

	async function persistedAction(action: Action, override: ObjectLiteral = {}) {
		const id = ids.gen(now);
		const note = { id, userId: viewer.id, userHost: null, replyId: null, renoteId: null, text: null, cw: null, hasPoll: false, fileIds: [], visibility: 'public' };
		const variants: Record<Action, [EntityTarget<ObjectLiteral>, ObjectLiteral]> = {
			reply: [MiNote, { ...note, replyId: targetNoteId, text: 'synthetic-private-reply' }],
			quote: [MiNote, { ...note, renoteId: targetNoteId, text: 'synthetic-private-quote' }],
			follow: [MiFollowing, { id, followerId: viewer.id, followeeId: targetAuthorId }],
			mute: [MiMuting, { id, muterId: viewer.id, muteeId: targetAuthorId, expiresAt: null }],
			block: [MiBlocking, { id, blockerId: viewer.id, blockeeId: targetAuthorId }],
			report: [MiAbuseUserReport, { id, reporterId: viewer.id, targetUserId: targetAuthorId, comment: 'synthetic-private-report', moderationNote: 'synthetic-private-moderation' }],
		};
		const [target, values] = variants[action];
		const row = await insert(target, { ...values, ...override });
		const observation: ObjectLiteral = { ...identity(), kind: 'action', action };
		if (action === 'reply' || action === 'quote') observation.evidenceNoteId = row.id;
		return { target, row, observation };
	}

	beforeAll(async () => {
		const address = new URL(databaseUrl!);
		if (!['127.0.0.1', 'localhost', 'source-postgres'].includes(address.hostname)) throw new Error('Only the explicitly configured local PostgreSQL is allowed');
		control = await new DataSource({ type: 'postgres', url: databaseUrl, synchronize: false, logging: false }).initialize();
		await control.query(`CREATE SCHEMA "${schema}"`);
		created = true;
		for (const table of tables) await control.query(`CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
		db = await new DataSource({ type: 'postgres', url: databaseUrl, schema, entities, synchronize: false, logging: false }).initialize();
	}, 30_000);

	beforeEach(async () => {
		now = Date.now();
		await control.query(`TRUNCATE ${tables.map(table => `"${schema}"."${table}"`).join(', ')}`);
		for (const id of [viewer.id, targetAuthorId, otherUserId]) await insert(MiUser, { id, username: id, usernameLower: id, host: null, isSuspended: false, isDeleted: false });
		await insert(MiUserProfile, { userId: viewer.id, mutedInstances: [] });
		await insert(MiMeta, { id: 'x', blockedHosts: [] });
		await insert(MiNote, { id: targetNoteId, userId: targetAuthorId, userHost: null, text: 'synthetic-private-target', fileIds: ['interactionimage'], attachedFileTypes: ['image/png'], visibility: 'public', replyId: null, renoteId: null });
		await insert(MiDriveFile, { id: 'interactionimage', type: 'image/png', userId: targetAuthorId, name: 'synthetic-image.png' });
		send = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockImplementation(async (_url, rawOptions) => {
			const options = rawOptions as { body: string };
			const envelope = JSON.parse(options.body);
			const rows = await control.query(`SELECT nonce FROM "${schema}".hanami_read_barrier WHERE nonce=$1`, [envelope.barrier.nonce]);
			expect(rows).toHaveLength(1);
			return { ok: true, json: async () => ack };
		});
		client = new HanamiPlatformClient(...[{
			id: 'aid', hanamiPlatform: { url: 'http://platform.example.test', keyId: 'synthetic', signingKey: 'synthetic-test-signing-key', sourceId: 'local-misskey', generation: 1 },
		}, db, { send }] as unknown as ConstructorParameters<typeof HanamiPlatformClient>);
	});

	afterAll(async () => {
		if (db?.isInitialized) await db.destroy();
		if (control?.isInitialized) {
			if (created) {
				await control.query(`DROP SCHEMA "${schema}" CASCADE`);
				expect(await control.query('SELECT to_regnamespace($1) AS schema', [schema])).toEqual([{ schema: null }]);
			}
			await control.destroy();
		}
	});

	test.each<Action>(['reply', 'quote', 'follow', 'mute', 'block', 'report'])('signs only the minimal fact for a persisted %s and commits its barrier before sending', async action => {
		const { row, observation } = await persistedAction(action);
		await expect(request([observation])).resolves.toEqual(ack);
		const [, options] = send.mock.calls[0] as [string, { body: string }];
		expect(JSON.parse(options.body).request.observations).toEqual([{ ...observation, verified: true, sourceRowId: row.id }]);
		expect(options.body).not.toContain('synthetic-private-');
	});

	test.each<[Action, ObjectLiteral]>([
		['reply', { userId: otherUserId }], ['reply', { replyId: 'anothernote' }],
		['quote', { userId: otherUserId }], ['quote', { renoteId: 'anothernote' }], ['quote', { text: null }],
		['follow', { followerId: otherUserId }], ['follow', { followeeId: otherUserId }],
		['mute', { muterId: otherUserId }], ['block', { blockeeId: otherUserId }],
		['report', { reporterId: otherUserId }], ['report', { targetUserId: otherUserId }],
	])('rejects a committed %s row with a mismatching operation condition %p', async (action, override) => {
		const { observation } = await persistedAction(action, override);
		await expect(request([observation])).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
		expect(send).not.toHaveBeenCalled();
		expect(await control.query(`SELECT count(*)::int AS count FROM "${schema}".hanami_read_barrier`)).toEqual([{ count: 0 }]);
	});

	/** Oracle: ユーザー要求の DM 除外は API の手製入力にも適用する。specified evidence は public target に紐づいても除外し、home/followers を同じ理由で除外しない。 */
	test.each(['reply', 'quote'] as const)('rejects a persisted specified %s without sending its evidence ID', async action => {
		const { observation } = await persistedAction(action, { visibility: 'specified', visibleUserIds: [targetAuthorId] });
		await expect(request([observation])).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
		expect(send).not.toHaveBeenCalled();
		expect(await control.query(`SELECT count(*)::int AS count FROM "${schema}".hanami_read_barrier`)).toEqual([{ count: 0 }]);
	});

	test.each<['reply' | 'quote', 'home' | 'followers']>([
		['reply', 'home'], ['reply', 'followers'], ['quote', 'home'], ['quote', 'followers'],
	])('permits a persisted %s whose visibility is %s', async (action, visibility) => {
		const { observation } = await persistedAction(action, { visibility });
		await expect(request([observation])).resolves.toEqual(ack);
		expect(send).toHaveBeenCalledTimes(1);
	});

	test('does not attest a pending follow request as an established following', async () => {
		await insert(MiFollowRequest, { id: ids.gen(now), followerId: viewer.id, followeeId: targetAuthorId });
		await expect(request([{ ...identity(), kind: 'action', action: 'follow' }])).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
		expect(send).not.toHaveBeenCalled();
	});

	test('does not attest an expired mute', async () => {
		const { observation } = await persistedAction('mute', { expiresAt: new Date(now) });
		await expect(request([observation])).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
		expect(send).not.toHaveBeenCalled();
	});

	test('does not attest a reply transaction that rolled back', async () => {
		const evidenceNoteId = ids.gen(now);
		const runner = db.createQueryRunner();
		await runner.connect();
		await runner.startTransaction();
		try {
			await runner.manager.insert(MiNote, { id: evidenceNoteId, userId: viewer.id, replyId: targetNoteId, text: 'synthetic-rolled-back', visibility: 'public' });
			await runner.rollbackTransaction();
		} finally { await runner.release(); }
		await expect(request([{ ...identity(), kind: 'action', action: 'reply', evidenceNoteId }])).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
		expect(send).not.toHaveBeenCalled();
	});

	test('rejects a new operation claim after the established following was removed', async () => {
		const { target, row, observation } = await persistedAction('follow');
		await request([observation]);
		await db.manager.delete(target, { id: row.id });
		send.mockClear();
		await expect(request([{ ...observation, eventId: 'after-unfollow' }])).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
		expect(send).not.toHaveBeenCalled();
	});

	test('validates actual image membership and media type', async () => {
		const observation = { ...identity(), kind: 'image_open', fileId: 'interactionimage' };
		await expect(request([observation])).resolves.toEqual(ack);
		await db.manager.update(MiDriveFile, { id: 'interactionimage' }, { type: 'application/pdf' });
		send.mockClear();
		await expect(request([observation])).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
		expect(send).not.toHaveBeenCalled();
	});
});
