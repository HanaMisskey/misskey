import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { FlashLikesRepository } from '@/models/mikroorm/_.js';
import type { MiUser } from '@/models/mikroorm/User.js';
import type { MiFlashLike } from '@/models/mikroorm/FlashLike.js';
import { bindThis } from '@/decorators.js';
import { FlashEntityService } from './FlashEntityService.js';

@Injectable()
export class FlashLikeEntityService {
	constructor(
		@Inject(DI.flashLikesRepository)
		private flashLikesRepository: FlashLikesRepository,

		private flashEntityService: FlashEntityService,
	) {}

	@bindThis
	public async pack(
		src: MiFlashLike['id'] | MiFlashLike,
		me?: { id: MiUser['id'] } | null | undefined,
	) {
		const like = typeof src === 'object' ? src : await this.flashLikesRepository.findOneOrFail({ id: src });

		return {
			id: like.id,
			flash: await this.flashEntityService.pack(like.flash ?? like.flashId, me),
		};
	}

	@bindThis
	public async packMany(
		likes: MiFlashLike[],
		me: { id: MiUser['id'] },
	) {
		return Promise.all(likes.map(like => this.pack(like, me)));
	}
}
