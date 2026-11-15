import { DataSource } from 'typeorm';
import { loadConfig } from './built/config.js';
import { entities } from './built/postgres.js';
import { isConcurrentIndexMigrationEnabled } from "./migration/js/migration-config.js";
import { selectMigrations, validateMigrationIdentities } from './migration/online/selection.mjs';
import { fileURLToPath } from 'node:url';

const config = loadConfig();
const onlineEnabled = isConcurrentIndexMigrationEnabled();
const migrations = await selectMigrations(fileURLToPath(new URL('./migration', import.meta.url)), onlineEnabled);
await validateMigrationIdentities(migrations);

export default new DataSource({
	type: 'postgres',
	host: config.db.host,
	port: config.db.port,
	username: config.db.user,
	password: config.db.pass,
	database: config.db.db,
	extra: config.db.extra,
	entities: entities,
	migrations: migrations.map(migration => migration.file),
	migrationsTransactionMode: onlineEnabled ? 'each' : 'all',
});
