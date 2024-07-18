export class SubscriptionPlan1704130867407 {
    name = 'SubscriptionPlan1704130867407'

    async up(queryRunner) {
        await queryRunner.query(`CREATE TABLE "subscription_plan" ("id" character varying(32) NOT NULL, "name" character varying(128) NOT NULL, "stripePriceId" character varying(128) NOT NULL, "roleId" character varying(32) NOT NULL, "isArchived" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_01hk5ppx4h56qe96t9dehjzhye" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_01hk5pxbb3f8fd71v1h3mm84gx" ON "subscription_plan" ("roleId")`);
        await queryRunner.query(`CREATE TYPE "public"."user_subscriptionstatus_enum" AS ENUM('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'paused', 'canceled', 'unpaid', 'none')`);
        await queryRunner.query(`ALTER TABLE "user" ADD "subscriptionStatus" "public"."user_subscriptionstatus_enum" NOT NULL DEFAULT 'none'`);
        await queryRunner.query(`ALTER TABLE "user" ADD "subscriptionPlanId" character varying(32)`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "enableSubscriptions" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "user_profile" ADD "stripeCustomerId" character varying(128)`);
        await queryRunner.query(`COMMENT ON COLUMN "user_profile"."stripeCustomerId" IS 'The stripe customer id of the User.'`);
    }

    async down(queryRunner) {
        await queryRunner.query(`COMMENT ON COLUMN "user_profile"."stripeCustomerId" IS 'The stripe customer id of the User.'`);
        await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "stripeCustomerId"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "enableSubscriptions"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "subscriptionPlanId"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "subscriptionStatus"`);
        await queryRunner.query(`DROP TYPE "public"."user_subscriptionstatus_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_01hk5pxbb3f8fd71v1h3mm84gx"`);
        await queryRunner.query(`DROP TABLE "subscription_plan"`);
    }
}
