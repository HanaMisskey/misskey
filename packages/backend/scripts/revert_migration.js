import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { MigrationExecutor } from 'typeorm';
import { CommandUtils } from 'typeorm/commands/CommandUtils.js';

export async function revertLastMigration(dataSource, options = {}) {
	const [last] = await new MigrationExecutor(dataSource).getExecutedMigrations();
	const migration = dataSource.migrations.find(candidate => (candidate.name ?? candidate.constructor.name) === last?.name);
	// TypeORM 1.1.0's revert ignores the migration's transaction override, unlike migration:run.
	const transaction = migration?.transaction === false ? 'none' : (options.transaction ?? dataSource.options.migrationsTransactionMode ?? 'all');
	await dataSource.undoLastMigration({ ...options, transaction });
}

async function main() {
	const { values } = parseArgs({
		options: {
			dataSource: { type: 'string', short: 'd', default: 'ormconfig.js' },
			transaction: { type: 'string', short: 't', default: 'default' },
			fake: { type: 'boolean', short: 'f', default: false },
			help: { type: 'boolean', short: 'h', default: false },
			version: { type: 'boolean', short: 'v', default: false },
		},
		allowNegative: true,
	});
	if (values.help) {
		console.log(`Usage: pnpm revert [options]

Reverts the last executed migration.

Options:
  -d, --dataSource   Path to the DataSource file [default: ormconfig.js]
  -t, --transaction  default, all, each, none, or false [default: default]
  -f, --fake         Remove the history entry without running the migration
  -h, --help         Show help
  -v, --version      Show TypeORM version`);
		return;
	}
	if (values.version) {
		const { version } = JSON.parse(await readFile(new URL(import.meta.resolve('typeorm/package.json')), 'utf8'));
		console.log(version);
		return;
	}
	const dataSource = await CommandUtils.loadDataSource(resolve(values.dataSource));
	dataSource.setOptions({
		subscribers: [],
		synchronize: false,
		migrationsRun: false,
		dropSchema: false,
		logging: ['query', 'error', 'schema'],
	});
	try {
		await dataSource.initialize();
		let transaction = dataSource.options.migrationsTransactionMode ?? 'all';
		if (values.transaction === 'all' || values.transaction === 'each') transaction = values.transaction;
		if (values.transaction === 'none' || values.transaction === 'false') transaction = 'none';
		await revertLastMigration(dataSource, { transaction, fake: values.fake });
	} finally {
		if (dataSource.isInitialized) await dataSource.destroy();
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	try {
		await main();
	} catch (error) {
		console.error('Error during migration revert:', error);
		process.exitCode = 1;
	}
}
