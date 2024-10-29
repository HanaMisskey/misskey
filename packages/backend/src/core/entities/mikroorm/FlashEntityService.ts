import { Inject, Injectable } from '@nestjs/common';
import { MikroORM } from '@mikro-orm/core';
import { DI } from '@/di-symbols.js';
import type { FlashLikesRepository, FlashsRepository } from '@/models/mikroorm/_.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiUser } from '@/models/mikroorm/User.js';
import type { MiFlash } from '@/models/mikroorm/Flash.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { UserEntityService } from './UserEntityService.js';

@Injectable()
export class FlashEntityService {
	constructor(
		@Inject(DI.flashsRepository)
		private flashsRepository: FlashsRepository,
		@Inject(DI.flashLikesRepository)
		private flashLikesRepository: FlashLikesRepository,
		private userEntityService: UserEntityService,
		private idService: IdService,
		private readonly orm: MikroORM,
	) {}

	@bindThis
	public async pack(
		src: MiFlash['id'] | MiFlash,
		me?: { id: MiUser['id'] } | null | undefined,
		hint?: {
			packedUser?: Packed<'UserLite'>,
			likedFlashIds?: MiFlash['id'][],
		},
	): Promise<Packed<'Flash'>> {
		const meId = me ? me.id : null;
		const flash = typeof src === 'object' ? src : await this.flashsRepository.findOneOrFail({ id: src });

		// { schema: 'UserDetailed' } すると無限ループするので注意
		const user = hint?.packedUser ?? await this.userEntityService.pack(flash.user ?? flash.userId, me);

		let isLiked = undefined;
		if (meId) {
			isLiked = hint?.likedFlashIds
				? hint.likedFlashIds.includes(flash.id)
				: await this.checkIfLiked(flash.id, meId); // helper関数に移動
		}

		return {
			id: flash.id,
			createdAt: this.idService.parse(flash.id).date.toISOString(),
			updatedAt: flash.updatedAt.toISOString(),
			userId: flash.userId,
			user: user,
			title: flash.title,
			summary: flash.summary,
			script: flash.script,
			visibility: flash.visibility,
			likedCount: flash.likedCount,
			isLiked: isLiked,
		};
	}

	@bindThis
	public async packMany(
		flashes: MiFlash[],
		me?: { id: MiUser['id'] } | null | undefined,
	): Promise<Packed<'Flash'>[]> {
		const _users = flashes.map(({ user, userId }) => user ?? userId);
		const _userMap = await this.userEntityService.packMany(_users, me)
			.then(users => new Map(users.map(u => [u.id, u])));

		// ログインユーザーがいる場合、該当するFlashの`isLiked`状態をまとめて取得
		const likedFlashIds = me
			? await this.flashLikesRepository.createQueryBuilder('flashLike')
				.select(['flashLike.flashId'])
				.where({ userId: me.id, flashId: { $in: flashes.map(flash => flash.id) } })
				.getResultList()
				.then(likes => new Set(likes.map(like => like.flashId)))
			: new Set();

		return Promise.all(
			flashes.map(flash => this.pack(flash, me, {
				packedUser: _userMap.get(flash.userId),
				likedFlashIds: Array.from(likedFlashIds),
			})),
		);
	}

	// MikroORMにはexistsがないので`SELECT 1`
	private async checkIfLiked(flashId: string, userId: string): Promise<boolean> {
		const result = await this.orm.em.getConnection().execute(
			'SELECT 1 FROM flash_like WHERE flash_id = ? AND user_id = ? LIMIT 1', [flashId, userId],
		);
		return result.length > 0;
	}
}
