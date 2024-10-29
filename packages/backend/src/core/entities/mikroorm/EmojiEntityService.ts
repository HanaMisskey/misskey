import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { EmojisRepository } from '@/models/mikroorm/_.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiEmoji } from '@/models/mikroorm/Emoji.js';
import { bindThis } from '@/decorators.js';

@Injectable()
export class EmojiEntityService {
	constructor(
		@Inject(DI.emojisRepository)
		private emojisRepository: EmojisRepository,
	) {}

	@bindThis
	public async packSimple(
		src: MiEmoji['id'] | MiEmoji,
	): Promise<Packed<'EmojiSimple'>> {
		const emoji = typeof src === 'object' ? src : await this.emojisRepository.findOneOrFail({ id: src });

		return {
			aliases: emoji.aliases,
			name: emoji.name,
			category: emoji.category,
			// 後方互換性のため || 演算子を使用
			url: emoji.publicUrl || emoji.originalUrl,
			localOnly: emoji.localOnly ? true : undefined,
			isSensitive: emoji.isSensitive ? true : undefined,
			roleIdsThatCanBeUsedThisEmojiAsReaction: emoji.roleIdsThatCanBeUsedThisEmojiAsReaction.length > 0 ? emoji.roleIdsThatCanBeUsedThisEmojiAsReaction : undefined,
		};
	}

	@bindThis
	public async packSimpleMany(
		emojis: MiEmoji[],
	): Promise<Packed<'EmojiSimple'>[]> {
		return Promise.all(emojis.map(x => this.packSimple(x)));
	}

	@bindThis
	public async packDetailed(
		src: MiEmoji['id'] | MiEmoji,
	): Promise<Packed<'EmojiDetailed'>> {
		const emoji = typeof src === 'object' ? src : await this.emojisRepository.findOneOrFail({ id: src });

		return {
			id: emoji.id,
			aliases: emoji.aliases,
			name: emoji.name,
			category: emoji.category,
			host: emoji.host,
			// 後方互換性のため || 演算子を使用
			url: emoji.publicUrl || emoji.originalUrl,
			license: emoji.license,
			isSensitive: emoji.isSensitive,
			localOnly: emoji.localOnly,
			roleIdsThatCanBeUsedThisEmojiAsReaction: emoji.roleIdsThatCanBeUsedThisEmojiAsReaction,
			remarks: emoji.remarks,
		};
	}

	@bindThis
	public async packDetailedMany(
		emojis: MiEmoji[],
	): Promise<Packed<'EmojiDetailed'>[]> {
		return Promise.all(emojis.map(x => this.packDetailed(x)));
	}
}
