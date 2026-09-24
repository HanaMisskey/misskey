/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class SensitiveMediaDetectionConfigDefaults1790109064226 {
	name = 'SensitiveMediaDetectionConfigDefaults1790109064226'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "sensitiveMediaDetectionTimeout" DROP NOT NULL`);
		await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "sensitiveMediaDetectionTimeout" DROP DEFAULT`);
		await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "sensitiveMediaDetectionMaxImagesPerRequest" DROP NOT NULL`);
		await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "sensitiveMediaDetectionMaxImagesPerRequest" DROP DEFAULT`);
	}

	async down(queryRunner) {
		await queryRunner.query(`UPDATE "meta" SET "sensitiveMediaDetectionTimeout" = 60000 WHERE "sensitiveMediaDetectionTimeout" IS NULL`);
		await queryRunner.query(`UPDATE "meta" SET "sensitiveMediaDetectionMaxImagesPerRequest" = 4 WHERE "sensitiveMediaDetectionMaxImagesPerRequest" IS NULL`);
		await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "sensitiveMediaDetectionTimeout" SET NOT NULL`);
		await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "sensitiveMediaDetectionTimeout" SET DEFAULT '60000'`);
		await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "sensitiveMediaDetectionMaxImagesPerRequest" SET NOT NULL`);
		await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "sensitiveMediaDetectionMaxImagesPerRequest" SET DEFAULT '4'`);
	}
}
