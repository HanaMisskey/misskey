export class HanamiReadBarrier1793404800000 {
	name = 'HanamiReadBarrier1793404800000';

	async up(queryRunner) {
		await queryRunner.query('CREATE TABLE "hanami_read_barrier" ("nonce" varchar(32) NOT NULL, "sourceId" varchar(128) NOT NULL, "generation" integer NOT NULL, "viewerId" varchar(32) NOT NULL, "createdAt" timestamptz NOT NULL, CONSTRAINT "PK_hanami_read_barrier" PRIMARY KEY ("nonce"))');
		await queryRunner.query('CREATE INDEX "IDX_hanami_read_barrier_created_at" ON "hanami_read_barrier" ("createdAt")');
	}

	async down(queryRunner) {
		await queryRunner.query('DROP TABLE "hanami_read_barrier"');
	}
}
