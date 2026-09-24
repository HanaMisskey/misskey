/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test, vi } from 'vitest';
import AdminMeta from '@/server/api/endpoints/admin/meta.js';
import type { Config } from '@/config.js';
import type { MiLocalUser } from '@/models/User.js';
import type { MetaService } from '@/core/MetaService.js';
import type { SystemAccountService } from '@/core/SystemAccountService.js';

/** PR #424: 再保存で継承を失わないよう、表示用ファイル既定値と null を含む DB 保存値は別に返す。 */
test('admin/meta は DB 保存値をファイルの表示用既定値で置き換えない', async () => {
	const endpoint = new AdminMeta({
		sensitiveMediaDetection: { apiUrl: 'http://detector:3009', useProxy: false, timeout: 9000, maxImagesPerRequest: 2 },
	} as Config, {
		fetch: vi.fn().mockResolvedValue({
			sensitiveMediaDetectionApiUrl: null, sensitiveMediaDetectionUseProxy: true,
			sensitiveMediaDetectionTimeout: null, sensitiveMediaDetectionMaxImagesPerRequest: 3,
		}),
	} as unknown as MetaService, { fetch: vi.fn().mockResolvedValue({ id: 'proxy' }) } as unknown as SystemAccountService);

	expect(await endpoint.exec({}, { id: 'admin' } as MiLocalUser, null)).toMatchObject({
		sensitiveMediaDetectionApiUrl: null, sensitiveMediaDetectionUseProxy: true,
		sensitiveMediaDetectionTimeout: null, sensitiveMediaDetectionMaxImagesPerRequest: 3,
		sensitiveMediaDetectionDefaults: { apiUrl: 'http://detector:3009', useProxy: false, timeout: 9000, maxImagesPerRequest: 2 },
	});
});
