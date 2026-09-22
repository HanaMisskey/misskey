/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('node:fs', async (importOriginal) => ({
	...await importOriginal<typeof import('node:fs')>(),
	readFileSync: vi.fn(),
	existsSync: vi.fn(),
}));

const rootDir = resolve(import.meta.dirname, '../../..');
const configDir = resolve(rootDir, '.config');
const files = new Map<string, string>();
const yaml = `
# Settings are read directly from YAML, including aliases.
url: https://hanami.example/
port: 3000
db:
  host: localhost
  port: 5432
  db: misskey
  user: misskey
  pass: test-only
redis: &redis
  host: localhost
  port: 6379
  pass: redis-test-only
redisForJobQueue: *redis
hanamisearch:
  host: search.example
  port: '7700'
  apiKey: test-only
  ssl: true
  index: notes
  scope: [local, social.example]
`;

describe('YAML configuration', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.stubEnv('NODE_ENV', 'test');
		vi.stubEnv('MISSKEY_CONFIG_YML', undefined);
		files.clear();
		files.set(resolve(rootDir, 'built/meta.json'), JSON.stringify({ version: 'test' }));
		vi.mocked(fs.existsSync).mockImplementation((file) => (
			String(file) === resolve(rootDir, 'packages') || files.has(String(file))
		));
		vi.mocked(fs.readFileSync).mockImplementation((file) => {
			const contents = files.get(String(file));
			if (contents === undefined) throw new Error(`Unexpected file read: ${String(file)}`);
			return contents;
		});
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test.each([
		{ mode: undefined, custom: undefined, selected: resolve(configDir, 'default.yml') },
		{ mode: 'production', custom: undefined, selected: resolve(configDir, 'default.yml') },
		{ mode: 'test', custom: undefined, selected: resolve(configDir, 'test.yml') },
		{ mode: 'production', custom: 'custom.yml', selected: resolve(configDir, 'custom.yml') },
		{ mode: 'test', custom: 'custom.yml', selected: resolve(configDir, 'custom.yml') },
		{ mode: 'test', custom: resolve(rootDir, 'custom.yml'), selected: resolve(rootDir, 'custom.yml') },
	])('loads $selected with NODE_ENV=$mode and MISSKEY_CONFIG_YML=$custom', async ({ mode, custom, selected }) => {
		vi.stubEnv('NODE_ENV', mode);
		vi.stubEnv('MISSKEY_CONFIG_YML', custom);
		files.set(selected, yaml);
		const { loadConfig, path } = await import('./config.js');

		expect(path).toBe(selected);
		expect(loadConfig().url).toBe('https://hanami.example');
	});

	test('preserves HanaMisskey search settings and YAML aliases without compiled JSON', async () => {
		files.set(resolve(configDir, 'test.yml'), yaml);
		const { loadConfig } = await import('./config.js');
		const config = loadConfig();

		expect(config.hanamisearch).toEqual({
			host: 'search.example',
			port: '7700',
			apiKey: 'test-only',
			ssl: true,
			index: 'notes',
			scope: ['local', 'social.example'],
		});
		expect(config.fulltextSearch?.provider).toBe('meilisearch');
		expect(config.redisForJobQueue).toMatchObject({
			host: 'localhost', port: 6379, password: 'redis-test-only', keyPrefix: 'hanami.example:',
		});
	});

	test('reloads YAML changes even when stale compiled configuration exists', async () => {
		files.set(resolve(rootDir, 'built/.config.json'), 'invalid stale JSON');
		files.set(resolve(rootDir, 'built/._config_.json'), 'invalid stale JSON');
		files.set(resolve(configDir, 'test.yml'), yaml);
		const { loadConfig } = await import('./config.js');
		expect(loadConfig().port).toBe(3000);

		files.set(resolve(configDir, 'test.yml'), yaml.replace('port: 3000', 'port: 4000'));
		expect(loadConfig().port).toBe(4000);
	});

	test('does not fall back to compiled JSON when the selected YAML is missing', async () => {
		files.set(resolve(rootDir, 'built/.config.json'), '{}');
		const { loadConfig } = await import('./config.js');

		expect(() => loadConfig()).toThrow(`Unexpected file read: ${resolve(configDir, 'test.yml')}`);
	});

	test('reports invalid YAML', async () => {
		files.set(resolve(configDir, 'test.yml'), 'url: [');
		const { loadConfig } = await import('./config.js');

		expect(() => loadConfig()).toThrow();
	});
});
