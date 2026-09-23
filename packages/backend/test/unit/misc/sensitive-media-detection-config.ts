/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { resolveSensitiveMediaDetectionConfig } from '@/misc/sensitive-media-detection-config.js';

/**
 * PR #424 の受入条件は、管理画面の保存値 > ファイル > 組み込みの優先順位。
 * null は継承、空キーは認証なし、false は Proxy 不使用なので、真偽値への変換で未設定を判定しない。
 * 組み込みの60000ms・4枚は migration/1780488454126-sensitiveMediaDetectionExternalService.js の既定値を維持する。
 */
describe('センシティブ判定の接続設定の継承', () => {
	const fileConfig = {
		apiUrl: 'http://detector:3009',
		apiKey: 'server-secret',
		useProxy: false,
		timeout: 12000,
		maxImagesPerRequest: 2,
	};

	test('ファイルと保存値が未指定なら組み込みの既定値を使う', () => {
		expect(resolveSensitiveMediaDetectionConfig()).toMatchObject({
			apiUrl: null, useProxy: true, timeout: 60000, maxImagesPerRequest: 4,
		});
	});

	test('管理画面が未指定ならファイルの接続設定を使う', () => {
		expect(resolveSensitiveMediaDetectionConfig(fileConfig, {
			sensitiveMediaDetectionApiUrl: null,
			sensitiveMediaDetectionApiKey: null,
			sensitiveMediaDetectionUseProxy: null,
			sensitiveMediaDetectionTimeout: null,
			sensitiveMediaDetectionMaxImagesPerRequest: null,
		})).toMatchObject({
			apiUrl: 'http://detector:3009', apiKey: 'server-secret', useProxy: false, timeout: 12000, maxImagesPerRequest: 2,
		});
	});

	test('管理画面の指定は該当項目だけを上書きし、他項目の継承を維持する', () => {
		expect(resolveSensitiveMediaDetectionConfig(fileConfig, {
			sensitiveMediaDetectionApiUrl: 'https://detector.example/api',
			sensitiveMediaDetectionTimeout: 9000,
		})).toMatchObject({
			apiUrl: 'https://detector.example/api', apiKey: 'server-secret', useProxy: false, timeout: 9000, maxImagesPerRequest: 2,
		});
	});

	test('管理画面の Proxy 不使用はファイルの Proxy 利用を上書きする', () => {
		expect(resolveSensitiveMediaDetectionConfig({ ...fileConfig, useProxy: true }, {
			sensitiveMediaDetectionUseProxy: false,
		}).useProxy).toBe(false);
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
});

/**
 * PR #424 ではファイルの空キーと false も明示指定であり、YAML 読込時に省略値へ置き換えられない。
 */
describe('loadConfig のセンシティブ判定設定', () => {
	const directory = mkdtempSync(join(tmpdir(), 'misskey-detector-config-'));
	const configFile = join(directory, 'test.yml');
	const baseConfig = readFileSync(new URL('../../../../../.github/misskey/test.yml', import.meta.url), 'utf8');
	let loadConfig: typeof import('@/config.js')['loadConfig'];

	beforeAll(async () => {
		vi.stubEnv('MISSKEY_CONFIG_YML', configFile);
		({ loadConfig } = await import('@/config.js'));
	});

	afterAll(() => {
		vi.unstubAllEnvs();
		rmSync(directory, { recursive: true, force: true });
	});

	test('YAML の接続設定を読み込み、空キーと Proxy 不使用も保持する', () => {
		writeFileSync(configFile, `${baseConfig}
sensitiveMediaDetection:
  apiUrl: http://detector:3009
  apiKey: ''
  useProxy: false
  timeout: 8000
  maxImagesPerRequest: 2
`);
		expect(loadConfig().sensitiveMediaDetection).toEqual({
			apiUrl: 'http://detector:3009', apiKey: '', useProxy: false, timeout: 8000, maxImagesPerRequest: 2,
		});
	});
});
