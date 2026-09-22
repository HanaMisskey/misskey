/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

/**
 * Oracle: 不正な設定ファイルは Misskey 起動時の loadConfig 入口で失敗する。
 * detector が未使用でも不正値を黙って無視しない。実 YAML を読み込んで配線も検証する。
 */
describe('Misskey 起動時の detector 設定読込', () => {
	const directory = mkdtempSync(join(tmpdir(), 'misskey-detector-config-'));
	const configFile = join(directory, 'test.yml');
	const baseConfig = readFileSync(new URL('../../../../.github/misskey/test.yml', import.meta.url), 'utf8');
	let loadConfig: typeof import('@/config.js')['loadConfig'];

	beforeAll(async () => {
		vi.stubEnv('MISSKEY_CONFIG_YML', configFile);
		({ loadConfig } = await import('@/config.js'));
	});

	afterAll(() => {
		vi.unstubAllEnvs();
		rmSync(directory, { recursive: true, force: true });
	});

	test('有効なファイル設定を起動設定として保持する', () => {
		writeFileSync(configFile, `${baseConfig}\nsensitiveMediaDetection:\n  apiUrl: http://detector:3009\n  useProxy: false\n  timeout: 8000\n`);
		expect(loadConfig().sensitiveMediaDetection).toEqual({ apiUrl: 'http://detector:3009', useProxy: false, timeout: 8000 });
	});

	test.each([
		['apiUrl', 'file:///tmp/detector'],
		['useProxy', 'false'],
		['timeout', 0],
		['maxImagesPerRequest', 1.5],
	])('ファイルの %s=%j は起動時に拒否する', (field, value) => {
		writeFileSync(configFile, `${baseConfig}\nsensitiveMediaDetection: ${JSON.stringify({ [field]: value })}\n`);
		expect(() => loadConfig()).toThrow(String(field));
	});
});
