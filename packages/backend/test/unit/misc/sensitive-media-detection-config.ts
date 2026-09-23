/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { resolveSensitiveMediaDetectionConfig } from '@/misc/sensitive-media-detection-config.js';

/**
 * PR #424 の受入条件は DB > ファイル > 組み込み。null は継承、空キーは認証なし、false は Proxy 不使用。
 * 組み込みの60000ms・4枚は migration/1780488454126-sensitiveMediaDetectionExternalService.js に由来する。
 */
describe('センシティブ判定の接続設定の継承', () => {
	const fileConfig = {
		apiUrl: 'http://detector:3009', apiKey: 'server-key', useProxy: true, timeout: 12000, maxImagesPerRequest: 2,
	};

	test('ファイルと保存値が未指定なら組み込みの既定値を使う', () => {
		expect(resolveSensitiveMediaDetectionConfig()).toMatchObject({
			apiUrl: null, useProxy: true, timeout: 60000, maxImagesPerRequest: 4,
		});
	});

	test('null の保存値はファイルを継承し、false もそのまま使う', () => {
		expect(resolveSensitiveMediaDetectionConfig({ ...fileConfig, useProxy: false }, {
			sensitiveMediaDetectionApiUrl: null, sensitiveMediaDetectionApiKey: null, sensitiveMediaDetectionUseProxy: null,
			sensitiveMediaDetectionTimeout: null, sensitiveMediaDetectionMaxImagesPerRequest: null,
		})).toEqual({ apiUrl: 'http://detector:3009', apiKey: 'server-key', useProxy: false, timeout: 12000, maxImagesPerRequest: 2 });
	});

	test('DB の指定項目だけを上書きし、false・旧既定値も明示値として扱う', () => {
		expect(resolveSensitiveMediaDetectionConfig(fileConfig, {
			sensitiveMediaDetectionApiKey: 'custom-key', sensitiveMediaDetectionUseProxy: false,
			sensitiveMediaDetectionTimeout: 60000, sensitiveMediaDetectionMaxImagesPerRequest: 4,
		})).toEqual({ apiUrl: 'http://detector:3009', apiKey: 'custom-key', useProxy: false, timeout: 60000, maxImagesPerRequest: 4 });
	});

	test.each([
		['https://custom.example', 'https://custom.example'],
		[' \t ', 'http://detector:3009'],
	])('DB の URL %j は接続先 %j を選ぶ', (apiUrl, expected) => {
		expect(resolveSensitiveMediaDetectionConfig(fileConfig, { sensitiveMediaDetectionApiUrl: apiUrl }).apiUrl).toBe(expected);
	});
});
