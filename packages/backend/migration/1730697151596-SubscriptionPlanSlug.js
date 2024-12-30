export class SubscriptionPlanSlug1730697151596 {
	name = 'SubscriptionPlanSlug1730697151596'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "subscription_plan" ADD "slug" character varying(128)`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_a8b506b29b6676308f7c0fc661" ON "subscription_plan" ("slug") `);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX "public"."IDX_a8b506b29b6676308f7c0fc661"`);
		await queryRunner.query(`ALTER TABLE "subscription_plan" DROP COLUMN "slug"`);
	}
}
