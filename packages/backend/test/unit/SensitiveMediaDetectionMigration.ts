/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { SensitiveMediaDetectionConfigDefaults1790109064226 } from '../../migration/1790109064226-sensitiveMediaDetectionConfigDefaults.js';

/**
 * 旧スキーマの NOT NULL・60000ms・4枚は migration/1780488454126-sensitiveMediaDetectionExternalService.js に由来する。
 * DB では既定値と同じ値の明示保存を区別できないため、PR #424 の移行では既存値を null に置換しない。
 */
describe('SensitiveMediaDetectionConfigDefaults migration', () => {
	let client: pg.Client;
	const migration = new SensitiveMediaDetectionConfigDefaults1790109064226();

	beforeEach(async () => {
		const { db } = loadConfig();
		client = new pg.Client({ host: db.host, port: db.port, user: db.user, password: db.pass, database: db.db });
		await client.connect();
		await client.query('BEGIN');
		// public の meta に migration を適用しないよう、試験ごとに独立した schema を使う。
		const schema = `detector_test_${randomUUID().replaceAll('-', '')}`;
		await client.query(`CREATE SCHEMA "${schema}"`);
		await client.query(`SET LOCAL search_path TO "${schema}"`);
	});

	afterEach(async () => {
		await client.query('ROLLBACK');
		await client.end();
	});

	test('up は既存の保存値を保持し、新規行の時間制限と一括枚数を null にする', async () => {
		await client.query(`CREATE TABLE "meta" (
			"id" text PRIMARY KEY,
			"sensitiveMediaDetectionTimeout" integer NOT NULL DEFAULT 60000,
			"sensitiveMediaDetectionMaxImagesPerRequest" integer NOT NULL DEFAULT 4
		)`);
		await client.query(`INSERT INTO "meta" ("id") VALUES ('existing-default')`);
		await client.query(`INSERT INTO "meta" VALUES ('existing-custom', 8000, 2)`);

		await migration.up(client);

		await client.query(`INSERT INTO "meta" ("id") VALUES ('new-inherited')`);
		expect((await client.query('SELECT * FROM "meta" ORDER BY "id"')).rows).toEqual([
			{ id: 'existing-custom', sensitiveMediaDetectionTimeout: 8000, sensitiveMediaDetectionMaxImagesPerRequest: 2 },
			{ id: 'existing-default', sensitiveMediaDetectionTimeout: 60000, sensitiveMediaDetectionMaxImagesPerRequest: 4 },
			{ id: 'new-inherited', sensitiveMediaDetectionTimeout: null, sensitiveMediaDetectionMaxImagesPerRequest: null },
		]);
	});

	test('down は null を従来の既定値で補い、明示値を保持して NOT NULL と既定値を戻す', async () => {
		await client.query(`CREATE TABLE "meta" (
			"id" text PRIMARY KEY,
			"sensitiveMediaDetectionTimeout" integer,
			"sensitiveMediaDetectionMaxImagesPerRequest" integer
		)`);
		await client.query(`INSERT INTO "meta" VALUES ('inherited-timeout', null, 2), ('inherited-batch', 8000, null)`);

		await migration.down(client);

		await client.query(`INSERT INTO "meta" ("id") VALUES ('after-rollback')`);
		expect((await client.query('SELECT * FROM "meta" ORDER BY "id"')).rows).toEqual([
			{ id: 'after-rollback', sensitiveMediaDetectionTimeout: 60000, sensitiveMediaDetectionMaxImagesPerRequest: 4 },
			{ id: 'inherited-batch', sensitiveMediaDetectionTimeout: 8000, sensitiveMediaDetectionMaxImagesPerRequest: 4 },
			{ id: 'inherited-timeout', sensitiveMediaDetectionTimeout: 60000, sensitiveMediaDetectionMaxImagesPerRequest: 2 },
		]);
		expect((await client.query(`SELECT column_name, is_nullable FROM information_schema.columns
			WHERE table_schema = current_schema() AND table_name = 'meta' AND column_name <> 'id'
			ORDER BY column_name`)).rows).toEqual([
			{ column_name: 'sensitiveMediaDetectionMaxImagesPerRequest', is_nullable: 'NO' },
			{ column_name: 'sensitiveMediaDetectionTimeout', is_nullable: 'NO' },
		]);
	});
});
