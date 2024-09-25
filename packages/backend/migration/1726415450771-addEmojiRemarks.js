export class AddEmojiRemarks1726415450771 {
	name = 'AddEmojiRemarks1726415450771';

	async up(queryRunner) {
		await queryRunner.query('ALTER TABLE "emoji" ADD "remarks" character varying(1024)');
	}

	async down(queryRunner) {
		await queryRunner.query('ALTER TABLE "emoji" DROP COLUMN "remarks"');
	}
}
