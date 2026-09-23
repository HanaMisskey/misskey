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

describe('管理者 API のセンシティブ判定設定', () => {
	const saved = {
		sensitiveMediaDetectionApiUrl: null,
		sensitiveMediaDetectionApiKey: null,
		sensitiveMediaDetectionUseProxy: null,
		sensitiveMediaDetectionTimeout: null,
		sensitiveMediaDetectionMaxImagesPerRequest: null,
	} as unknown as MiMeta;
	const admin = { id: 'admin' } as MiLocalUser;

	test('admin/meta は保存値とファイルの既定値を分け、ファイルの API キーを返さない', async () => {
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
		expect(response).toMatchObject({
			sensitiveMediaDetectionApiUrl: null, sensitiveMediaDetectionApiKey: null, sensitiveMediaDetectionUseProxy: null,
			sensitiveMediaDetectionTimeout: null, sensitiveMediaDetectionMaxImagesPerRequest: null,
		});
		expect(response.sensitiveMediaDetectionDefaults).toEqual({
			apiUrl: 'http://detector:3009', useProxy: false, timeout: 9000, maxImagesPerRequest: 2,
		});
		expect(JSON.stringify(response)).not.toContain('never-expose-this-key');
	});

	function updateEndpoint() {
		const update = vi.fn().mockResolvedValue(undefined);
		const endpoint = new UpdateMeta(saved, {
			fetch: vi.fn().mockResolvedValue(saved), update,
		} as unknown as MetaService, { log: vi.fn() } as unknown as ModerationLogService);
		return { endpoint, update };
	}

	test('admin/update-meta は数値・キー・Proxy 設定の null を継承指定として保存する', async () => {
		const { endpoint, update } = updateEndpoint();
		await endpoint.exec({
			sensitiveMediaDetectionTimeout: null, sensitiveMediaDetectionMaxImagesPerRequest: null,
			sensitiveMediaDetectionApiKey: null, sensitiveMediaDetectionUseProxy: null,
		}, admin, null);
		expect(update).toHaveBeenCalledWith({
			sensitiveMediaDetectionTimeout: null, sensitiveMediaDetectionMaxImagesPerRequest: null,
			sensitiveMediaDetectionApiKey: null, sensitiveMediaDetectionUseProxy: null,
		});
	});

	test('admin/update-meta は認証なしの空キーと Proxy 不使用の false を保存する', async () => {
		const { endpoint, update } = updateEndpoint();
		await endpoint.exec({ sensitiveMediaDetectionApiKey: '', sensitiveMediaDetectionUseProxy: false }, admin, null);
		expect(update).toHaveBeenCalledWith({ sensitiveMediaDetectionApiKey: '', sensitiveMediaDetectionUseProxy: false });
	});
});
