/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFile, cp, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const migrationDirectory = fileURLToPath(new URL('../../migration', import.meta.url));
const sourceName = '1767169026317-birthday-index.js';

async function selection(directory = migrationDirectory) {
	return import(pathToFileURL(join(directory, 'online/selection.mjs')).href);
}

async function copyMigrations(t) {
	const directory = await mkdtemp(join(tmpdir(), 'misskey-online-migrations-'));
	t.after(() => rm(directory, { recursive: true, force: true }));
	await cp(migrationDirectory, directory, { recursive: true });
	return directory;
}

/** Oracle: opting out preserves the existing migration glob and Operator's SHA-256 of each source file. */
test('normal mode selects every original migration once with its original file hash', async () => {
	const { selectMigrations } = await selection();
	const selected = await selectMigrations(migrationDirectory, false);
	const originalFiles = (await readdir(migrationDirectory)).filter(file => file.endsWith('.js')).sort();
	assert.ok(originalFiles.length > 0);
	assert.deepEqual(selected.map(entry => basename(entry.file)).sort(), originalFiles);
	assert.equal(new Set(selected.map(entry => entry.file)).size, selected.length);
	for (const entry of selected) {
		assert.equal(entry.file, join(migrationDirectory, basename(entry.file)));
		assert.equal(entry.sourceSha256, createHash('sha256').update(await readFile(entry.file)).digest('hex'));
	}
});

/** Oracle: the explicit online opt-in changes only the declared migration, retaining its TypeORM identity. */
test('online mode replaces BirthdayIndex once and leaves undeclared migrations unchanged', async t => {
	const directory = await copyMigrations(t);
	await writeFile(join(directory, '1999999999999-future.js'), 'export class Future1999999999999 {}\n');
	const { selectMigrations } = await selection(directory);
	const normal = await selectMigrations(directory, false);
	const online = await selectMigrations(directory, true);
	assert.equal(online.length, normal.length);
	const replacement = online.filter(entry => entry.name === 'BirthdayIndex1767169026317');
	assert.equal(replacement.length, 1);
	assert.equal(replacement[0].file, join(directory, 'online', sourceName));
	assert.ok(!online.some(entry => entry.file === join(directory, sourceName)));
	assert.deepEqual(replacement[0].recoverableIndexes.toSorted(), [
		'public.IDX_USERPROFILE_BIRTHDAY_DATE',
		'public.IDX_de22cd2b445eee31ae51cdbe99',
	].toSorted());
	assert.deepEqual(
		online.filter(entry => entry.file !== replacement[0].file),
		normal.filter(entry => entry.file !== join(directory, sourceName)),
	);
	const original = await import(pathToFileURL(join(migrationDirectory, sourceName)).href);
	const substitute = await import(pathToFileURL(join(migrationDirectory, 'online', sourceName)).href);
	assert.equal(new substitute.BirthdayIndex1767169026317().name, new original.BirthdayIndex1767169026317().name);
});

/** Oracle: a replacement written for an older upstream source must not silently execute after that source changes. */
test('upstream drift rejects online selection while normal mode keeps using the changed source', async t => {
	const directory = await copyMigrations(t);
	await appendFile(join(directory, sourceName), '\n// upstream changed\n');
	const { selectMigrations } = await selection(directory);
	await assert.rejects(async () => selectMigrations(directory, true), /hash|sha|changed|mismatch/i);
	assert.ok((await selectMigrations(directory, false)).some(entry => entry.file === join(directory, sourceName)));
});

/** Oracle: TypeORM stores instance.name when present; the declared BirthdayIndex identity must match that of the selected class. */
test('identity validation accepts the matching online migration and rejects a different manifest name', async t => {
	const { selectMigrations, validateMigrationIdentities } = await selection();
	await validateMigrationIdentities(await selectMigrations(migrationDirectory, true));
	const directory = await copyMigrations(t);
	const manifestFile = join(directory, 'online/manifest.json');
	const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
	await writeFile(join(directory, manifest.migrations[0].implementation), 'export class OnlineBirthday { name = "BirthdayIndex1767169026317"; async up() {} async down() {} }\n');
	await validateMigrationIdentities(await selectMigrations(directory, true));
	manifest.migrations[0].name = 'DifferentBirthdayIndex1767169026317';
	await writeFile(manifestFile, JSON.stringify(manifest));
	const selected = await selectMigrations(directory, true);
	await assert.rejects(
		() => validateMigrationIdentities(selected),
		/identity|name|mismatch/i,
	);
});

/** Oracle: TypeORM uses the class name when instance.name is absent; the filename does not determine history identity. */
test('a different source filename timestamp preserves a matching class-based migration identity', async t => {
	const directory = await copyMigrations(t);
	const manifestFile = join(directory, 'online/manifest.json');
	const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
	const definition = manifest.migrations[0];
	definition.source = '1999999999999-birthday-index.js';
	await rename(join(directory, sourceName), join(directory, definition.source));
	await writeFile(join(directory, definition.implementation), 'export class BirthdayIndex1767169026317 { async up() {} async down() {} }\n');
	await writeFile(manifestFile, JSON.stringify(manifest));
	const { selectMigrations, validateMigrationIdentities } = await selection(directory);
	const selected = await selectMigrations(directory, true);
	assert.equal(selected.filter(entry => entry.name === 'BirthdayIndex1767169026317').length, 1);
	await validateMigrationIdentities(selected);
});

/** Oracle: Operator's accepted plan must become stale when any code selected for execution changes. */
test('the execution hash changes with the implementation, shared helper, selection code, and manifest entry', async t => {
	const directory = await copyMigrations(t);
	const manifestFile = join(directory, 'online/manifest.json');
	const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
	assert.equal(manifest.version, 1);
	const definition = manifest.migrations.find(entry => entry.name === 'BirthdayIndex1767169026317');
	assert.ok(definition);
	assert.ok(definition.dependencies.length > 0);
	const { selectMigrations } = await selection(directory);
	const selectedHash = async () => (await selectMigrations(directory, true)).find(entry => entry.name === definition.name).sourceSha256;
	for (const relativePath of [definition.implementation, ...definition.dependencies, 'online/selection.mjs']) {
		const before = await selectedHash();
		await appendFile(join(directory, relativePath), '\n// execution content changed\n');
		assert.notEqual(await selectedHash(), before, relativePath);
	}
	const before = await selectedHash();
	definition.recoverableIndexes = [];
	await writeFile(manifestFile, JSON.stringify(manifest));
	assert.notEqual(await selectedHash(), before);
});
