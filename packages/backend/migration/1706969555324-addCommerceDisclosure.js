export class AddCommerceDisclosure1706969555324 {
    name = 'AddCommerceDisclosure1706969555324'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "commerceDisclosureUrl" character varying(1024)`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "commerceDisclosureUrl"`);
    }
}
