/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { SensitiveMediaDetectionService } from '@/core/SensitiveMediaDetectionService.js';
import type { Config } from '@/config.js';
import type { MiMeta } from '@/models/_.js';
import type { HttpRequestService } from '@/core/HttpRequestService.js';
import type { LoggerService } from '@/core/LoggerService.js';

/**
 * Oracle: ファイル設定を継承した判定リクエストは、その URL・キー・待ち時間・一括枚数・経路を使う。
 * 起動時にコピーした Meta ではなく、管理者が更新した次の要求から新しい値で接続する。
 */
describe('判定リクエストへの外部設定の適用', () => {
	test('全接続項目を継承し、次の Meta 更新でキーを除去して Proxy 経由へ切り替える', async () => {
		const meta = {
			sensitiveMediaDetectionApiUrl: null,
			sensitiveMediaDetectionApiKey: null,
			sensitiveMediaDetectionUseProxy: null,
			sensitiveMediaDetectionTimeout: null,
			sensitiveMediaDetectionMaxImagesPerRequest: null,
		} as unknown as MiMeta;
		const send = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
			success: true, result: { results: [{ success: true, predictions: [
				{ className: 'safe', probability: 1 }, { className: 'nsfw', probability: 0 },
			] }] },
		}) });
		const service = new SensitiveMediaDetectionService({
			sensitiveMediaDetection: { apiUrl: 'http://detector:3009/prefix', apiKey: 'server-secret', useProxy: false, timeout: 8000, maxImagesPerRequest: 1 },
		} as Config, meta, { send } as unknown as HttpRequestService, {
			getLogger: () => ({ warn: vi.fn() }),
		} as unknown as LoggerService);

		const result = await service.detectSensitiveMany([Buffer.from('a'), Buffer.from('b')]);
		expect(result).toHaveLength(2);
		expect(result.every(predictions => predictions !== null)).toBe(true);
		expect(send).toHaveBeenCalledTimes(2);
		expect(send.mock.calls[0][0]).toBe('http://detector:3009/prefix/v1/detect-images');
		expect(send.mock.calls[0][1]).toMatchObject({
			headers: { Authorization: 'Bearer server-secret' }, timeout: 8000, bypassProxy: true, isLocalAddressAllowed: true,
		});

		meta.sensitiveMediaDetectionApiKey = '';
		meta.sensitiveMediaDetectionUseProxy = true;
		await service.detectSensitive(Buffer.from('c'));
		expect(send.mock.calls[2][1]).toMatchObject({ headers: {}, bypassProxy: false });
		expect(send.mock.calls[2][1].headers).not.toHaveProperty('Authorization');
	});
});
