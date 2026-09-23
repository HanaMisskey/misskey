/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { resolveSensitiveMediaDetectionConfig } from '@/misc/sensitive-media-detection-config.js';

describe('センシティブ判定の接続設定の継承', () => {
	const fileConfig = {
		apiUrl: 'http://detector:3009',
		apiKey: 'server-secret',
		useProxy: false,
		timeout: 12000,
		maxImagesPerRequest: 2,
	};

	test('ファイルと保存値が未指定なら組み込みの既定値を使う', () => {
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
});

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
