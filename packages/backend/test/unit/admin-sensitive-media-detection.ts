/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import AdminMeta from '@/server/api/endpoints/admin/meta.js';
import UpdateMeta from '@/server/api/endpoints/admin/update-meta.js';
import type { Config } from '@/config.js';
import type { MetaService } from '@/core/MetaService.js';
import type { SystemAccountService } from '@/core/SystemAccountService.js';
import type { ModerationLogService } from '@/core/ModerationLogService.js';
import type { MiMeta } from '@/models/_.js';
import type { MiLocalUser } from '@/models/User.js';

/**
 * Oracle: 管理画面のフォーム値と未指定時のサーバー設定値を別々に返す。
 * ファイルの API キーはブラウザへ公開せず、継承の null と明示的な認証なしを保存時にも区別する。
 */
describe('管理者 API のセンシティブ判定設定', () => {
	const saved = {
		sensitiveMediaDetectionApiUrl: null,
		sensitiveMediaDetectionApiKey: null,
		sensitiveMediaDetectionUseProxy: null,
		sensitiveMediaDetectionTimeout: null,
		sensitiveMediaDetectionMaxImagesPerRequest: null,
	} as unknown as MiMeta;
	const admin = { id: 'admin' } as MiLocalUser;

	test('ファイルの値は補足説明用に返し、フォーム値に混ぜず、秘密を返さない', async () => {
		const endpoint = new AdminMeta({
			sensitiveMediaDetection: {
				apiUrl: 'http://detector:3009', apiKey: 'never-expose-this-key', useProxy: false, timeout: 9000, maxImagesPerRequest: 2,
			},
		} as Config, {
			fetch: vi.fn().mockResolvedValue(saved),
		} as unknown as MetaService, {
			fetch: vi.fn().mockResolvedValue({ id: 'proxy' }),
		} as unknown as SystemAccountService);
		const response = await endpoint.exec({}, admin, null);
		expect(response).toMatchObject(saved);
		expect(response.sensitiveMediaDetectionDefaults).toEqual({
			apiUrl: 'http://detector:3009', useProxy: false, timeout: 9000, maxImagesPerRequest: 2,
		});
		expect(JSON.stringify(response)).not.toContain('never-expose-this-key');
	});

	test('ファイル未指定時も説明用の組み込み既定値を返す', async () => {
		const endpoint = new AdminMeta({} as Config, {
			fetch: vi.fn().mockResolvedValue(saved),
		} as unknown as MetaService, {
			fetch: vi.fn().mockResolvedValue({ id: 'proxy' }),
		} as unknown as SystemAccountService);
		expect((await endpoint.exec({}, admin, null)).sensitiveMediaDetectionDefaults).toEqual({
			apiUrl: null, useProxy: true, timeout: 60000, maxImagesPerRequest: 4,
		});
	});

	test.each([
		{ sensitiveMediaDetectionTimeout: null, sensitiveMediaDetectionMaxImagesPerRequest: null, sensitiveMediaDetectionApiKey: null, sensitiveMediaDetectionUseProxy: null },
		{ sensitiveMediaDetectionApiKey: '', sensitiveMediaDetectionUseProxy: false },
	])('継承または明示的な空キー・falseを保存値 %j のまま渡す', async (params) => {
		const update = vi.fn().mockResolvedValue(undefined);
		const endpoint = new UpdateMeta(saved, {
			fetch: vi.fn().mockResolvedValue(saved), update,
		} as unknown as MetaService, { log: vi.fn() } as unknown as ModerationLogService);
		await endpoint.exec(params, admin, null);
		expect(update).toHaveBeenCalledWith(params);
	});
});
