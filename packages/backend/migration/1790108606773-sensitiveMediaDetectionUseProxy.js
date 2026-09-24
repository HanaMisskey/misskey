/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class SensitiveMediaDetectionUseProxy1790108606773 {
	name = 'SensitiveMediaDetectionUseProxy1790108606773'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ADD "sensitiveMediaDetectionUseProxy" boolean`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "sensitiveMediaDetectionUseProxy"`);
	}
}
