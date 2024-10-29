import { Options } from '@mikro-orm/core';
import { loadConfig } from './built/config.js';
import { entitiesOfMikroORM } from './built/postgres.js';

const config = loadConfig();

const ormConfig: Options = {
	type: 'postgresql',
	host: config.db.host,
	port: config.db.port,
	user: config.db.user,
	password: config.db.pass,
	dbName: config.db.db,
	entities: entitiesOfMikroORM,
	migrations: {
		path: './migration/mikroorm', // マイグレーションのパス
		pattern: /^[\w-]+\d+\.js$/, // ファイルパターン
	},
	driverOptions: config.db.extra,
};

export default ormConfig;
