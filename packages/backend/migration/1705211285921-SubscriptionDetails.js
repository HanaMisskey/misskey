export class SubscriptionDetails1705211285921 {
    name = 'SubscriptionDetails1705211285921'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "subscription_plan" ADD "price" integer NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE "subscription_plan" ADD "currency" character varying(128) NOT NULL DEFAULT 'JPY'`);
        await queryRunner.query(`ALTER TABLE "subscription_plan" ADD "description" character varying(1024)`);
    }

    async down(queryRunner) {
				await queryRunner.query(`ALTER TABLE "subscription_plan" DROP COLUMN "description"`);
        await queryRunner.query(`ALTER TABLE "subscription_plan" DROP COLUMN "currency"`);
        await queryRunner.query(`ALTER TABLE "subscription_plan" DROP COLUMN "price"`);
		}
}
