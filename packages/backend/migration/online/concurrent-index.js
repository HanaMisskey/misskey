/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export async function ensureConcurrentIndex(queryRunner, qualifiedName, createSql) {
	const status = async () => (await queryRunner.query(
		'SELECT indisvalid FROM pg_index WHERE indexrelid = to_regclass($1)', [qualifiedName],
	))[0];
	let index = await status();
	if (index && !index.indisvalid) {
		// IF NOT EXISTS would preserve the unusable index left by an interrupted concurrent build.
		await queryRunner.query(`DROP INDEX CONCURRENTLY ${qualifiedName}`);
		index = undefined;
	}
	if (!index) await queryRunner.query(createSql);
	if (!(await status())?.indisvalid) throw new Error(`Concurrent index is not valid: ${qualifiedName}`);
}
