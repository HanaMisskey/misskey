/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import pg from 'pg';
import { DataSource } from 'typeorm';

export async function database(t, migrations = [], online = true) {
	const connectionString = process.env.MISSKEY_MIGRATION_TEST_DATABASE_URL;
	if (!connectionString) throw new Error('Set MISSKEY_MIGRATION_TEST_DATABASE_URL to a disposable PostgreSQL server with CREATE DATABASE permission.');
	const admin = new pg.Client({ connectionString });
	await admin.connect();
	const name = `migration_${randomUUID().replaceAll('-', '')}`;
	await admin.query(`CREATE DATABASE "${name}"`);
	const url = new URL(connectionString);
	url.pathname = `/${name}`;
	const clients = [];
	const dataSource = new DataSource({
		type: 'postgres',
		url: url.href,
		migrations,
		migrationsTransactionMode: online ? 'each' : 'all',
	});
	t.after(async () => {
		await Promise.all(clients.map(client => client.end()));
		if (dataSource.isInitialized) await dataSource.destroy();
		await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
		await admin.end();
	});
	await dataSource.initialize();
	await dataSource.query('CREATE TABLE "user_profile" ("userId" text PRIMARY KEY, "birthday" text)');
	await dataSource.query(`INSERT INTO "user_profile" VALUES ('leap', '2000-02-29'), ('year-end', '1999-12-31'), ('unknown', NULL)`);
	await dataSource.query('CREATE INDEX "IDX_de22cd2b445eee31ae51cdbe99" ON "user_profile" (substr("birthday", 6, 5))');
	return {
		dataSource,
		async connect() {
			const client = new pg.Client({ connectionString: url.href });
			await client.connect();
			clients.push(client);
			return client;
		},
	};
}

export async function waitFor(description, probe) {
	const deadline = Date.now() + 10000;
	do {
		const result = await probe();
		if (result) return result;
		await setTimeout(10);
	} while (Date.now() < deadline);
	throw new Error(`Timed out waiting for ${description}`);
}
