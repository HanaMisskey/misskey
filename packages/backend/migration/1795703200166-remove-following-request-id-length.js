/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class RemoveFollowingRequestIdLength1795703200166 {
	name = 'RemoveFollowingRequestIdLength1795703200166';

	async up(queryRunner) {
		await queryRunner.query(`LOCK TABLE "following" IN ACCESS EXCLUSIVE MODE NOWAIT`);
		await queryRunner.query(`ALTER TABLE "following" ALTER COLUMN "requestId" TYPE character varying`);
	}

	async down(queryRunner) {
		// varchar(512) への型変換だけでは、512 文字を超えた部分が空白の ID が切り詰められる。
		await queryRunner.query(`ALTER TABLE "following" ADD CONSTRAINT "following_request_id_length_512" CHECK (char_length("requestId") <= 512)`);
		await queryRunner.query(`ALTER TABLE "following" ALTER COLUMN "requestId" TYPE character varying(512)`);
		await queryRunner.query(`ALTER TABLE "following" DROP CONSTRAINT "following_request_id_length_512"`);
	}
}
