import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { basename } from 'node:path';
import { BirthdayIndex1767169026317 } from '../../migration/1767169026317-birthday-index.js';
import { database, waitFor } from './postgres.mjs';

const migrationDirectory = fileURLToPath(new URL('../../migration', import.meta.url));
const migrationName = 'BirthdayIndex1767169026317';
const newIndex = 'IDX_USERPROFILE_BIRTHDAY_DATE';
const oldIndex = 'IDX_de22cd2b445eee31ae51cdbe99';

async function onlineMigrationFile() {
	const { selectMigrations } = await import('../../migration/online/selection.mjs');
	const selected = await selectMigrations(migrationDirectory, true);
	const birthday = selected.filter(entry => basename(entry.file) === '1767169026317-birthday-index.js');
	assert.equal(birthday.length, 1);
	return birthday[0].file;
}

async function indexes(dataSource) {
	return dataSource.query(`SELECT c.relname AS name, i.indisvalid AS valid, pg_get_indexdef(c.oid) AS definition
		FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
		WHERE i.indrelid = 'public.user_profile'::regclass ORDER BY c.relname`);
}

async function schema(dataSource) {
	return {
		indexes: await indexes(dataSource),
		functions: await dataSource.query(`SELECT p.proname, pg_get_function_result(p.oid) AS result,
			pg_get_function_arguments(p.oid) AS arguments, p.provolatile, l.lanname
			FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
			WHERE p.oid = to_regprocedure('public.get_birthday_date(text)')`),
	};
}

async function history(dataSource) {
	return dataSource.query('SELECT timestamp, name FROM migrations ORDER BY id');
}

/** Oracle: TypeORM identifies an applied migration by its original name/timestamp; opt-in must not create another history entry. */
test('online migration records the upstream identity once and subsequent runs are empty', async t => {
	const { dataSource } = await database(t, [await onlineMigrationFile()]);
	assert.equal((await dataSource.runMigrations()).length, 1);
	assert.deepEqual(await history(dataSource), [{ timestamp: '1767169026317', name: migrationName }]);
	assert.deepEqual(await dataSource.runMigrations(), []);
	assert.equal((await history(dataSource)).length, 1);
	assert.deepEqual(await dataSource.query('SELECT "userId", get_birthday_date(birthday) AS birthday FROM user_profile ORDER BY "userId"'), [
		{ userId: 'leap', birthday: 229 },
		{ userId: 'unknown', birthday: null },
		{ userId: 'year-end', birthday: 1231 },
	]);
});

/** Oracle: opt-in on an already upgraded database must not rerun DDL or duplicate the standard TypeORM history. */
test('a migration applied in normal mode is already applied in online mode', async t => {
	const { dataSource } = await database(t, [BirthdayIndex1767169026317], false);
	await dataSource.runMigrations();
	const before = await schema(dataSource);
	const selectedModule = await import(pathToFileURL(await onlineMigrationFile()).href);
	dataSource.migrations = [new selectedModule.BirthdayIndex1767169026317()];
	assert.deepEqual(await dataSource.runMigrations({ transaction: 'each' }), []);
	assert.deepEqual(await schema(dataSource), before);
	assert.equal((await history(dataSource)).length, 1);
});

/** Characterization oracle: independently executing upstream up/down defines the catalog changes to preserve; concrete birthday values are checked separately. */
test('normal and online migration produce the same schema and revert restores the original schema', async t => {
	const normal = await database(t, [BirthdayIndex1767169026317], false);
	const online = await database(t, [await onlineMigrationFile()]);
	const original = await schema(normal.dataSource);
	await normal.dataSource.runMigrations();
	await online.dataSource.runMigrations();
	assert.deepEqual(await schema(online.dataSource), await schema(normal.dataSource));
	const { revertLastMigration } = await import('../../scripts/revert_migration.js');
	await revertLastMigration(online.dataSource);
	assert.deepEqual(await schema(online.dataSource), original);
	assert.deepEqual(await history(online.dataSource), []);
	await revertLastMigration(normal.dataSource);
	assert.deepEqual(await schema(normal.dataSource), original);
});

/** Oracle: the existing normal-mode revert is atomic; a failed down must roll back its earlier writes. */
test('a failed normal revert rolls back its changes and keeps its history', async t => {
	class FailingRevert1999999999999 {
		async up(queryRunner) {
			await queryRunner.query('CREATE TABLE revert_probe (value integer)');
		}

		async down(queryRunner) {
			await queryRunner.query('INSERT INTO revert_probe VALUES (1)');
			throw new Error('revert interrupted');
		}
	}
	const { dataSource } = await database(t, [FailingRevert1999999999999], false);
	await dataSource.runMigrations();
	const { revertLastMigration } = await import('../../scripts/revert_migration.js');
	await assert.rejects(() => revertLastMigration(dataSource), /revert interrupted/);
	assert.deepEqual(await dataSource.query('SELECT * FROM revert_probe'), []);
	assert.equal((await history(dataSource)).length, 1);
});

/** Oracle: TypeORM's fake revert removes only the history entry and preserves the applied schema. */
test('fake online revert preserves the schema while removing the history entry', async t => {
	const { dataSource } = await database(t, [await onlineMigrationFile()]);
	await dataSource.runMigrations();
	const before = await schema(dataSource);
	const { revertLastMigration } = await import('../../scripts/revert_migration.js');
	await revertLastMigration(dataSource, { fake: true });
	assert.deepEqual(await schema(dataSource), before);
	assert.deepEqual(await history(dataSource), []);
});

/** Oracle: while a pre-existing writer delays index construction, another writer must commit and the usable old index must remain. */
test('writes continue while the new index is being built and cancellation can be resumed', { timeout: 20000 }, async t => {
	const fixture = await database(t, [await onlineMigrationFile()]);
	const { dataSource } = fixture;
	const blocker = await fixture.connect();
	const observer = await fixture.connect();
	const writer = await fixture.connect();
	await blocker.query('BEGIN');
	await blocker.query(`UPDATE user_profile SET birthday = '2000-02-29' WHERE "userId" = 'leap'`);
	const running = dataSource.runMigrations().then(value => ({ value }), error => ({ error }));
	const progress = await waitFor('migration waiting on the existing writer', async () => {
		const result = await observer.query(`SELECT pid FROM pg_stat_activity
			WHERE datname = current_database() AND state = 'active' AND wait_event_type = 'Lock'`);
		return result.rows[0];
	});
	await writer.query("SET statement_timeout = '2s'");
	await writer.query(`INSERT INTO user_profile VALUES ('during-build', '2001-03-04')`);
	assert.ok((await indexes(dataSource)).some(index => index.name === oldIndex && index.valid));
	assert.equal((await observer.query(`SELECT count(*)::int AS count FROM user_profile WHERE "userId" = 'during-build'`)).rows[0].count, 1);
	assert.equal((await observer.query('SELECT pg_cancel_backend($1) AS cancelled', [progress.pid])).rows[0].cancelled, true);
	const interrupted = await running;
	assert.ok(interrupted.error);
	assert.equal(interrupted.error.driverError.code, '57014');
	const interruptedIndexes = await indexes(dataSource);
	assert.ok(interruptedIndexes.some(index => index.name === newIndex && !index.valid));
	assert.ok(interruptedIndexes.some(index => index.name === oldIndex && index.valid));
	assert.deepEqual(await history(dataSource), []);
	const resuming = dataSource.runMigrations().then(value => ({ value }), error => ({ error }));
	await waitFor('invalid index recovery waiting on the existing writer', async () => {
		const result = await observer.query(`SELECT pid FROM pg_stat_activity
			WHERE datname = current_database() AND state = 'active' AND wait_event_type = 'Lock'`);
		return result.rows[0];
	});
	await writer.query(`INSERT INTO user_profile VALUES ('during-resume', '2004-05-06')`);
	await blocker.query('ROLLBACK');
	const resumed = await resuming;
	assert.ifError(resumed.error);
	assert.equal(resumed.value.length, 1);
	const completedIndexes = await indexes(dataSource);
	assert.ok(completedIndexes.some(index => index.name === newIndex && index.valid));
	assert.ok(!completedIndexes.some(index => index.name === oldIndex));
	assert.equal((await history(dataSource)).length, 1);
});

/** Oracle: an online revert must keep accepting writes and preserve the applied history until the old index has been restored successfully. */
test('writes continue during revert and cancelled restoration can be resumed', { timeout: 20000 }, async t => {
	const fixture = await database(t, [await onlineMigrationFile()]);
	const { dataSource } = fixture;
	const { revertLastMigration } = await import('../../scripts/revert_migration.js');
	await dataSource.runMigrations();
	const blocker = await fixture.connect();
	const observer = await fixture.connect();
	const writer = await fixture.connect();
	await blocker.query('BEGIN');
	await blocker.query(`UPDATE user_profile SET birthday = '2000-02-29' WHERE "userId" = 'leap'`);
	const reverting = revertLastMigration(dataSource).then(value => ({ value }), error => ({ error }));
	const progress = await waitFor('revert waiting on the existing writer', async () => {
		const result = await observer.query(`SELECT pid FROM pg_stat_activity
			WHERE datname = current_database() AND state = 'active' AND wait_event_type = 'Lock'`);
		return result.rows[0];
	});
	await writer.query("SET statement_timeout = '2s'");
	await writer.query(`INSERT INTO user_profile VALUES ('during-revert', '2001-03-04')`);
	assert.ok((await indexes(dataSource)).some(index => index.name === newIndex && index.valid));
	assert.equal((await observer.query('SELECT pg_cancel_backend($1) AS cancelled', [progress.pid])).rows[0].cancelled, true);
	assert.ok((await reverting).error);
	assert.ok((await indexes(dataSource)).some(index => index.name === oldIndex && !index.valid));
	assert.ok((await indexes(dataSource)).some(index => index.name === newIndex && index.valid));
	assert.equal((await history(dataSource)).length, 1);
	await blocker.query('ROLLBACK');
	await revertLastMigration(dataSource);
	assert.deepEqual(await history(dataSource), []);
	assert.ok((await indexes(dataSource)).some(index => index.name === oldIndex && index.valid));
	assert.ok(!(await indexes(dataSource)).some(index => index.name === newIndex));
	assert.deepEqual((await schema(dataSource)).functions, []);
});

/** Oracle: process interruption after a committed step must leave the previous index usable and allow the same migration to complete once. */
for (const stage of ['function created', 'new index valid']) {
	test(`the migration resumes after ${stage}`, async t => {
		const file = await onlineMigrationFile();
		const { dataSource } = await database(t, [file]);
		const selectedModule = await import(pathToFileURL(file).href);
		const migration = new selectedModule.BirthdayIndex1767169026317();
		const runner = dataSource.createQueryRunner();
		await runner.connect();
		const interruption = new Error(`connection interrupted after ${stage}`);
		try {
			await assert.rejects(() => migration.up({
				async query(sql, parameters) {
					const result = await runner.query(sql, parameters);
					const current = await schema(dataSource);
					const reached = stage === 'function created'
						? current.functions.length === 1
						: current.indexes.some(index => index.name === newIndex && index.valid);
					if (reached) throw interruption;
					return result;
				},
			}), error => error === interruption);
		} finally {
			await runner.release();
		}
		assert.ok((await indexes(dataSource)).some(index => index.name === oldIndex && index.valid));
		assert.equal((await dataSource.runMigrations()).length, 1);
		assert.equal((await history(dataSource)).length, 1);
		assert.ok((await indexes(dataSource)).some(index => index.name === newIndex && index.valid));
		assert.ok(!(await indexes(dataSource)).some(index => index.name === oldIndex));
	});
}
