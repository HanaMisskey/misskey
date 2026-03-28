export class AddMultipartUploadSettings1774732586238 {
    name = 'AddMultipartUploadSettings1774732586238'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "useMultipartUpload" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "objectStorageStagingBucket" character varying(1024)`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "objectStorageStagingEndpoint" character varying(1024)`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "objectStorageStagingRegion" character varying(1024)`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "objectStorageStagingAccessKey" character varying(1024)`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "objectStorageStagingSecretKey" character varying(1024)`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "objectStorageStagingPort" integer`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "objectStorageStagingUseSSL" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "objectStorageStagingUseProxy" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "objectStorageStagingS3ForcePathStyle" boolean NOT NULL DEFAULT true`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "objectStorageStagingS3ForcePathStyle"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "objectStorageStagingUseProxy"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "objectStorageStagingUseSSL"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "objectStorageStagingPort"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "objectStorageStagingSecretKey"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "objectStorageStagingAccessKey"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "objectStorageStagingRegion"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "objectStorageStagingEndpoint"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "objectStorageStagingBucket"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "useMultipartUpload"`);
    }
}
