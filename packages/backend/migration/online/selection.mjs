/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function migrationPath(directory, path) {
	if (typeof path !== 'string' || !path || isAbsolute(path) || relative(directory, resolve(directory, path)).startsWith('..')) {
		throw new Error(`Invalid online migration path: ${path}`);
	}
	return resolve(directory, path);
}

export async function selectMigrations(migrationDirectory, onlineEnabled) {
	const directory = resolve(migrationDirectory);
	const files = (await readdir(directory, { withFileTypes: true }))
		.filter(entry => entry.isFile() && entry.name.endsWith('.js'))
		.map(entry => entry.name).sort();
	const selected = await Promise.all(files.map(async source => {
		const file = resolve(directory, source);
		return { file, sourceSha256: createHash('sha256').update(await readFile(file)).digest('hex') };
	}));
	if (!onlineEnabled) return selected;

	const manifest = JSON.parse(await readFile(resolve(directory, 'online/manifest.json'), 'utf8'));
	if (manifest.version !== 1 || !Array.isArray(manifest.migrations)) {
		throw new Error('Unsupported online migration manifest');
	}
	const sources = new Set();
	const names = new Set();
	const implementations = new Set();
	for (const entry of manifest.migrations) {
		if (!entry || typeof entry.name !== 'string' || !/\d{13}$/.test(entry.name) ||
			!Array.isArray(entry.dependencies) || !Array.isArray(entry.recoverableIndexes) ||
			!entry.recoverableIndexes.every(name => typeof name === 'string' && /^[^.]+\.[^.]+$/.test(name))) {
			throw new Error('Invalid online migration manifest entry');
		}
		const position = files.indexOf(entry.source);
		const implementation = migrationPath(directory, entry.implementation);
		if (position === -1 || sources.has(entry.source) || names.has(entry.name) || implementations.has(implementation)) {
			throw new Error(`Missing or duplicate online migration: ${entry.source}`);
		}
		if (selected[position].sourceSha256 !== entry.sourceSha256) {
			throw new Error(`Online migration source hash mismatch: ${entry.source}`);
		}
		sources.add(entry.source);
		names.add(entry.name);
		implementations.add(implementation);

		const hash = createHash('sha256');
		const contents = [
			['manifest', Buffer.from(JSON.stringify(entry))],
			['selection', await readFile(new URL(import.meta.url))],
		];
		for (const path of [entry.implementation, ...entry.dependencies].sort()) {
			contents.push([path, await readFile(migrationPath(directory, path))]);
		}
		for (const [path, content] of contents) {
			hash.update(JSON.stringify([path, content.length]) + '\n');
			hash.update(content);
		}
		selected[position] = {
			file: implementation,
			name: entry.name,
			sourceSha256: hash.digest('hex'),
			recoverableIndexes: entry.recoverableIndexes,
		};
	}
	return selected;
}

export async function validateMigrationIdentities(selected) {
	for (const entry of selected) {
		if (!entry.name) continue;
		const exports = Object.values(await import(pathToFileURL(entry.file).href));
		const migration = exports.length === 1 && typeof exports[0] === 'function' ? new exports[0]() : undefined;
		if ((migration?.name ?? migration?.constructor.name) !== entry.name) {
			throw new Error(`Online migration identity does not match ${entry.name}: ${entry.file}`);
		}
	}
}
