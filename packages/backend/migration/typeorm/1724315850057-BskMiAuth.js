export class BskMiAuth1724315850057 {
	name = 'BskMiAuth1724315850057'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user" ADD "bskUserId" character varying(32)`);
		await queryRunner.query(`ALTER TABLE "user" ADD "bskAccessToken" character varying(128)`);
		await queryRunner.query(`ALTER TABLE "user" ADD "bskMigratedEntities" character varying(16) array NOT NULL DEFAULT '{}'`);
		await queryRunner.query(`CREATE INDEX "IDX_69680e0947b6168da6449bfd5c" ON "user" ("bskUserId") `);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX "public"."IDX_69680e0947b6168da6449bfd5c"`);
		await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "bskMigratedEntities"`);
		await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "bskAccessToken"`);
		await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "bskUserId"`);
	}
}
