/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ensureConcurrentIndex } from './concurrent-index.js';

export class BirthdayIndex1767169026317 {
	name = 'BirthdayIndex1767169026317';
	transaction = false;

	async up(queryRunner) {
		await queryRunner.query(`CREATE OR REPLACE FUNCTION public.get_birthday_date(birthday TEXT) RETURNS SMALLINT AS $$ BEGIN RETURN CAST((SUBSTR(birthday, 6, 2) || SUBSTR(birthday, 9, 2)) AS SMALLINT); END; $$ LANGUAGE plpgsql IMMUTABLE;`);
		await ensureConcurrentIndex(queryRunner, '"public"."IDX_USERPROFILE_BIRTHDAY_DATE"',
			`CREATE INDEX CONCURRENTLY "IDX_USERPROFILE_BIRTHDAY_DATE" ON "public"."user_profile" (public.get_birthday_date("birthday"))`);
		await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "public"."IDX_de22cd2b445eee31ae51cdbe99"`);
	}

	async down(queryRunner) {
		await ensureConcurrentIndex(queryRunner, '"public"."IDX_de22cd2b445eee31ae51cdbe99"',
			`CREATE INDEX CONCURRENTLY "IDX_de22cd2b445eee31ae51cdbe99" ON "public"."user_profile" (substr("birthday", 6, 5))`);
		await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "public"."IDX_USERPROFILE_BIRTHDAY_DATE"`);
		await queryRunner.query(`DROP FUNCTION IF EXISTS public.get_birthday_date(birthday TEXT)`);
	}
}
