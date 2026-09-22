/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { resolveSensitiveMediaDetectionConfig, validateSensitiveMediaDetectionConfig } from '@/misc/sensitive-media-detection-config.js';

/**
 * Oracle: 管理画面の明示値を項目ごとに優先し、未指定はファイル、その次に既定値を使う。
 * 空の API キーは「認証なし」、false は「直接接続」という明示指定であり、継承ではない。
 * 数値の既定値 60000ms と 4枚は移行前の公開設定、Proxy 利用の既定 true は S3 と同じ契約。
 */
describe('センシティブ判定の接続設定の継承', () => {
	const fileConfig = {
		apiUrl: 'http://detector:3009',
		apiKey: 'server-secret',
		useProxy: false,
		timeout: 12000,
		maxImagesPerRequest: 2,
	};

	test('ファイルと管理画面が未指定なら従来の既定値を返す', () => {
		expect(resolveSensitiveMediaDetectionConfig()).toEqual({
			apiUrl: null, apiKey: null, useProxy: true, timeout: 60000, maxImagesPerRequest: 4,
		});
	});

	test('管理画面が未指定ならファイルの接続設定を使う', () => {
		expect(resolveSensitiveMediaDetectionConfig(fileConfig, {
			sensitiveMediaDetectionApiUrl: null,
			sensitiveMediaDetectionApiKey: null,
			sensitiveMediaDetectionUseProxy: null,
			sensitiveMediaDetectionTimeout: null,
			sensitiveMediaDetectionMaxImagesPerRequest: null,
		})).toEqual({
			apiUrl: 'http://detector:3009', apiKey: 'server-secret', useProxy: false, timeout: 12000, maxImagesPerRequest: 2,
		});
	});

	test('管理画面の指定は該当項目だけを上書きし、他項目の継承を維持する', () => {
		expect(resolveSensitiveMediaDetectionConfig(fileConfig, {
			sensitiveMediaDetectionApiUrl: 'https://detector.example/api',
			sensitiveMediaDetectionTimeout: 9000,
		})).toEqual({
			apiUrl: 'https://detector.example/api', apiKey: 'server-secret', useProxy: false, timeout: 9000, maxImagesPerRequest: 2,
		});
	});

	test('認証なしと Proxy 不使用はファイルの指定を上書きする', () => {
		expect(resolveSensitiveMediaDetectionConfig({ ...fileConfig, useProxy: true }, {
			sensitiveMediaDetectionApiKey: '',
			sensitiveMediaDetectionUseProxy: false,
		})).toEqual({
			apiUrl: 'http://detector:3009', apiKey: '', useProxy: false, timeout: 12000, maxImagesPerRequest: 2,
		});
	});

	test.each(['', ' \t '])('管理画面の URL が空欄 %j ならファイルを継承する', (apiUrl) => {
		expect(resolveSensitiveMediaDetectionConfig(fileConfig, { sensitiveMediaDetectionApiUrl: apiUrl }).apiUrl)
			.toBe('http://detector:3009');
	});

	test('移行前に保存された既定値も管理画面の明示値として保持する', () => {
		expect(resolveSensitiveMediaDetectionConfig(fileConfig, {
			sensitiveMediaDetectionTimeout: 60000,
			sensitiveMediaDetectionMaxImagesPerRequest: 4,
		})).toMatchObject({ timeout: 60000, maxImagesPerRequest: 4 });
	});

	test('Meta 更新後の次の解決に新しい保存値を使い、継承元の設定は変更しない', () => {
		const meta = { sensitiveMediaDetectionTimeout: 7000 as number | null };
		expect(resolveSensitiveMediaDetectionConfig(fileConfig, meta).timeout).toBe(7000);
		meta.sensitiveMediaDetectionTimeout = null;
		expect(resolveSensitiveMediaDetectionConfig(fileConfig, meta).timeout).toBe(12000);
		expect(fileConfig.timeout).toBe(12000);
	});
});

/**
 * Oracle: 誤ったファイル設定は起動時に拒否する。接続先は HTTP(S)、timeout は Node の
	 * setTimeout が桁あふれで 1ms に変わらない範囲、一括枚数も DB integer と同じ範囲に限る。
 */
describe('センシティブ判定のファイル設定の検証', () => {
	test('設定ブロックの省略と各項目の省略を許す', () => {
		expect(validateSensitiveMediaDetectionConfig(undefined)).toBeUndefined();
		expect(validateSensitiveMediaDetectionConfig({})).toEqual({});
	});

	test('明示的な認証なし、直接接続、数値範囲の端を許す', () => {
		expect(validateSensitiveMediaDetectionConfig({
			apiUrl: 'https://detector.example/path/', apiKey: '', useProxy: false, timeout: 2147483647, maxImagesPerRequest: 1,
		})).toEqual({
			apiUrl: 'https://detector.example/path/', apiKey: '', useProxy: false, timeout: 2147483647, maxImagesPerRequest: 1,
		});
	});

	test.each([null, [], true, 'detector'])('設定ブロック %j は設定値として扱えない', (input) => {
		expect(() => validateSensitiveMediaDetectionConfig(input)).toThrow('sensitiveMediaDetection');
	});

	test.each([
		['apiUrl', 'http://'], ['apiUrl', '/relative'], ['apiUrl', 'file:///tmp/detector'], ['apiUrl', 42], ['apiUrl', null],
		['apiKey', false], ['apiKey', null],
		['useProxy', 'false'], ['useProxy', 0], ['useProxy', null],
		['timeout', 0], ['timeout', -1], ['timeout', 1.5], ['timeout', '60000'], ['timeout', null], ['timeout', 2147483648],
		['maxImagesPerRequest', 0], ['maxImagesPerRequest', 1.5], ['maxImagesPerRequest', '4'], ['maxImagesPerRequest', null],
		['maxImagesPerRequest', 2147483648],
		['maxImagesPerRequest', Number.MAX_SAFE_INTEGER + 1],
	])('%s=%j を該当項目が分かるエラーとして拒否する', (field, value) => {
		expect(() => validateSensitiveMediaDetectionConfig({ [field]: value })).toThrow(String(field));
	});
});
