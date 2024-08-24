export class EmojiHasMovement1723367092501 {
    name = 'EmojiHasMovement1723367092501'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "emoji" ADD "hasMovement" boolean NOT NULL DEFAULT false`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "emoji" DROP COLUMN "hasMovement"`);
    }
}
