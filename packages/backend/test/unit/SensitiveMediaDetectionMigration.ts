/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { SensitiveMediaDetectionConfigDefaults1790109064226 } from '../../migration/1790109064226-sensitiveMediaDetectionConfigDefaults.js';

/**
 * Oracle: 移行済みインスタンスの保存値は変更しない。新規行は null を既定として継承できる。
 * rollback は継承していた行に従来の 60000ms/4枚を戻し、明示値を保持する。
 * 実 PostgreSQL の独立した一時 schema を transaction 内で使用し、既存テーブルに触れない。
 */
describe('センシティブ判定接続設定の nullable 移行', () => {
	test('既存値を保持して新規行だけ継承し、rollback で旧スキーマに戻せる', async () => {
		const { db } = loadConfig();
		const client = new pg.Client({ host: db.host, port: db.port, user: db.user, password: db.pass, database: db.db });
		await client.connect();
		try {
			await client.query('BEGIN');
			const schema = `detector_test_${randomUUID().replaceAll('-', '')}`;
			await client.query(`CREATE SCHEMA "${schema}"`);
			await client.query(`SET LOCAL search_path TO "${schema}"`);
			await client.query(`CREATE TABLE "meta" (
				"id" text PRIMARY KEY,
				"sensitiveMediaDetectionTimeout" integer NOT NULL DEFAULT 60000,
				"sensitiveMediaDetectionMaxImagesPerRequest" integer NOT NULL DEFAULT 4
			)`);
			await client.query(`INSERT INTO "meta" ("id") VALUES ('existing-default')`);
			await client.query(`INSERT INTO "meta" VALUES ('existing-custom', 8000, 2)`);
			const migration = new SensitiveMediaDetectionConfigDefaults1790109064226();
			await migration.up(client);
			await client.query(`INSERT INTO "meta" ("id") VALUES ('new-inherited')`);
			expect((await client.query('SELECT * FROM "meta" ORDER BY "id"')).rows).toEqual([
				{ id: 'existing-custom', sensitiveMediaDetectionTimeout: 8000, sensitiveMediaDetectionMaxImagesPerRequest: 2 },
				{ id: 'existing-default', sensitiveMediaDetectionTimeout: 60000, sensitiveMediaDetectionMaxImagesPerRequest: 4 },
				{ id: 'new-inherited', sensitiveMediaDetectionTimeout: null, sensitiveMediaDetectionMaxImagesPerRequest: null },
			]);

			await migration.down(client);
			await client.query(`INSERT INTO "meta" ("id") VALUES ('after-rollback')`);
			expect((await client.query('SELECT * FROM "meta" ORDER BY "id"')).rows).toEqual([
				{ id: 'after-rollback', sensitiveMediaDetectionTimeout: 60000, sensitiveMediaDetectionMaxImagesPerRequest: 4 },
				{ id: 'existing-custom', sensitiveMediaDetectionTimeout: 8000, sensitiveMediaDetectionMaxImagesPerRequest: 2 },
				{ id: 'existing-default', sensitiveMediaDetectionTimeout: 60000, sensitiveMediaDetectionMaxImagesPerRequest: 4 },
				{ id: 'new-inherited', sensitiveMediaDetectionTimeout: 60000, sensitiveMediaDetectionMaxImagesPerRequest: 4 },
			]);
		} finally {
			await client.query('ROLLBACK');
			await client.end();
		}
	});
});
