/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import AdminMeta from '@/server/api/endpoints/admin/meta.js';
import UpdateMeta from '@/server/api/endpoints/admin/update-meta.js';
import { loadConfig } from '@/config.js';
import { MetaService } from '@/core/MetaService.js';
import { MiMeta } from '@/models/Meta.js';
import { entities } from '@/postgres.js';
import type { SystemAccountService } from '@/core/SystemAccountService.js';
import type { ModerationLogService } from '@/core/ModerationLogService.js';
import type { MiLocalUser } from '@/models/User.js';

/**
 * PR #424 では、管理画面は保存値を編集し、ファイルの既定値を説明欄へ表示する。
 * 継承値を保存値として返すと再保存で継承が失われるため、表示用の既定値と null を含む保存値を分ける。
 */
describe('管理者 API のセンシティブ判定設定', () => {
	const schema = `detector_api_${randomUUID().replaceAll('-', '')}`;
	const config = loadConfig();
	const database = new DataSource({
		type: 'postgres', host: config.db.host, port: config.db.port,
		username: config.db.user, password: config.db.pass, database: config.db.db,
		entities, schema, installExtensions: false,
	});
	let metaService: MetaService;
	const admin = { id: 'admin' } as MiLocalUser;

	beforeAll(async () => {
		// public の設定を変更しないよう、実 entity のテーブルを独立した schema に作る。
		await database.initialize();
		await database.query(`CREATE SCHEMA "${schema}"`);
		await database.synchronize();
		metaService = new MetaService(
			new EventEmitter() as ConstructorParameters<typeof MetaService>[0],
			database,
			{} as ConstructorParameters<typeof MetaService>[2],
			{ publishInternalEvent: vi.fn() } as unknown as ConstructorParameters<typeof MetaService>[3],
			{} as ConstructorParameters<typeof MetaService>[4],
		);
	});

	beforeEach(async () => {
		await database.getRepository(MiMeta).clear();
		await database.getRepository(MiMeta).save({ id: 'x' });
	});

	afterAll(async () => {
		metaService?.dispose();
		if (database.isInitialized) {
			await database.query(`DROP SCHEMA "${schema}" CASCADE`);
			await database.destroy();
		}
	});

	test('admin/meta は未指定の保存値と表示用のファイル既定値を分けて返す', async () => {
		const endpoint = new AdminMeta({
			...config,
			sensitiveMediaDetection: {
				apiUrl: 'http://detector:3009', apiKey: 'server-key', useProxy: false, timeout: 9000, maxImagesPerRequest: 2,
			},
		}, metaService, {
			fetch: vi.fn().mockResolvedValue({ id: 'proxy' }),
		} as unknown as SystemAccountService);
		const response = await endpoint.exec({}, admin, null);
		expect(response).toMatchObject({
			sensitiveMediaDetectionApiUrl: null, sensitiveMediaDetectionApiKey: null, sensitiveMediaDetectionUseProxy: null,
			sensitiveMediaDetectionTimeout: null, sensitiveMediaDetectionMaxImagesPerRequest: null,
		});
		expect(response.sensitiveMediaDetectionDefaults).toMatchObject({
			apiUrl: 'http://detector:3009', useProxy: false, timeout: 9000, maxImagesPerRequest: 2,
		});
	});

	async function updateEndpoint() {
		return new UpdateMeta(await metaService.fetch(true), metaService, { log: vi.fn() } as unknown as ModerationLogService);
	}

	test('admin/update-meta は保存済みの数値・キー・Proxy 設定を null に戻せる', async () => {
		await database.getRepository(MiMeta).update('x', {
			sensitiveMediaDetectionTimeout: 8000, sensitiveMediaDetectionMaxImagesPerRequest: 2,
			sensitiveMediaDetectionApiKey: 'previous-key', sensitiveMediaDetectionUseProxy: true,
		});
		const endpoint = await updateEndpoint();
		await endpoint.exec({
			sensitiveMediaDetectionTimeout: null, sensitiveMediaDetectionMaxImagesPerRequest: null,
			sensitiveMediaDetectionApiKey: null, sensitiveMediaDetectionUseProxy: null,
		}, admin, null);
		expect(await database.getRepository(MiMeta).findOneByOrFail({ id: 'x' })).toMatchObject({
			sensitiveMediaDetectionTimeout: null, sensitiveMediaDetectionMaxImagesPerRequest: null,
			sensitiveMediaDetectionApiKey: null, sensitiveMediaDetectionUseProxy: null,
		});
	});

	test('admin/update-meta は認証なしの空キーと Proxy 不使用の false を保存する', async () => {
		const endpoint = await updateEndpoint();
		await endpoint.exec({ sensitiveMediaDetectionApiKey: '', sensitiveMediaDetectionUseProxy: false }, admin, null);
		expect(await database.getRepository(MiMeta).findOneByOrFail({ id: 'x' })).toMatchObject({
			sensitiveMediaDetectionApiKey: '', sensitiveMediaDetectionUseProxy: false,
		});
	});
});
