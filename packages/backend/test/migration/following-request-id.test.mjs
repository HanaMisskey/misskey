/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import assert from 'node:assert/strict';
import { basename } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { selectMigrations, validateMigrationIdentities } from '../../migration/online/selection.mjs';
import { database } from './postgres.mjs';

const migrationDirectory = fileURLToPath(new URL('../../migration', import.meta.url));
const upstreamFile = '1794917481157-following-request-id.js';
const upstreamName = 'FollowingRequestId1794917481157';

async function followingDatabase(t, online) {
	const selected = await selectMigrations(migrationDirectory, online);
	await validateMigrationIdentities(selected);
	const migrations = selected
		.filter(({ file }) => basename(file) === upstreamFile || file.endsWith('-remove-following-request-id-length.js'))
		.map(({ file }) => file);
	const fixture = await database(t, migrations, online);
	await fixture.dataSource.query('CREATE TABLE "following" ("id" varchar(32) PRIMARY KEY)');
	return fixture;
}

/**
 * Follow の識別子は Activity の参照先になるため、既存の値も512文字を超える絶対URLも保存前と完全に一致する。
 * 上流 migration を適用済みのDBを作ってから、同じ履歴の上で後続 migration を実行する。
 */
test('following stores existing and longer Follow IDs without changing their values', async t => {
	const { dataSource } = await followingDatabase(t, false);
	const migrations = dataSource.migrations;
	dataSource.migrations = migrations.filter(migration => migration.name === upstreamName);
	assert.deepEqual((await dataSource.runMigrations()).map(migration => migration.name), [upstreamName]);

	const existingId = 'https://remote.example/activities/follow/existing';
	const longId = `https://remote.example/activities/follow/${'reference-'.repeat(55)}end`;
	assert.ok(longId.length > 512);
	await dataSource.query('INSERT INTO "following" ("id", "requestId") VALUES ($1, $2), ($3, NULL)', ['existing', existingId, 'local']);

	dataSource.migrations = migrations;
	await dataSource.runMigrations();
	await dataSource.query('INSERT INTO "following" ("id", "requestId") VALUES ($1, $2)', ['remote', longId]);
	assert.deepEqual(await dataSource.query('SELECT "id", "requestId" FROM "following" ORDER BY "id"'), [
		{ id: 'existing', requestId: existingId },
		{ id: 'local', requestId: null },
		{ id: 'remote', requestId: longId },
	]);
	assert.deepEqual(await dataSource.query('SELECT "name" FROM "migrations" WHERE "timestamp" = $1', [1794917481157]), [
		{ name: upstreamName },
	]);
});

/**
 * AccessExclusiveLock が取得できない間は online migration が既存の読み取りを待たずに55P03で失敗する。
 * ロック解放後は上流と同じ履歴IDで実行できる。
 */
test('the online Follow ID migration leaves existing readers and its upstream history intact', async t => {
	const fixture = await followingDatabase(t, true);
	const { dataSource } = fixture;
	const blocker = await fixture.connect();
	await blocker.query('BEGIN');
	await blocker.query('SELECT "id" FROM "following"');
	await dataSource.query("SET statement_timeout = '2s'");
	try {
		await assert.rejects(() => dataSource.runMigrations(), error => error.driverError?.code === '55P03');
		assert.deepEqual(await dataSource.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'following' ORDER BY column_name"), [
			{ column_name: 'id' },
		]);
		assert.deepEqual(await dataSource.query('SELECT "name" FROM "migrations"'), []);
	} finally {
		await blocker.query('ROLLBACK');
	}

	assert.equal((await dataSource.runMigrations())[0].name, upstreamName);
	assert.deepEqual(await dataSource.runMigrations(), []);
});
