export class AddEmojiNote1726415450771 {
	name = 'AddEmojiNote1726415450771';

	async up(queryRunner) {
		await queryRunner.query('ALTER TABLE "emoji" ADD "note" character varying(1024)');
	}

	async down(queryRunner) {
		await queryRunner.query('ALTER TABLE "emoji" DROP COLUMN "note"');
	}
}
