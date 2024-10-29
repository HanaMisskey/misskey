import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { PageLikesRepository } from '@/models/mikroorm/_.js';
import type { } from '@/models/mikroorm/Blocking.js';
import type { MiUser } from '@/models/mikroorm/User.js';
import type { MiPageLike } from '@/models/mikroorm/PageLike.js';
import { bindThis } from '@/decorators.js';
import { PageEntityService } from './PageEntityService.js';

@Injectable()
export class PageLikeEntityService {
	constructor(
		@Inject(DI.pageLikesRepository)
		private pageLikesRepository: PageLikesRepository,

		private pageEntityService: PageEntityService,
	) {}

	@bindThis
	public async pack(
		src: MiPageLike['id'] | MiPageLike,
		me?: { id: MiUser['id'] } | null | undefined,
	) {
		const like = typeof src === 'object' ? src : await this.pageLikesRepository.findOneOrFail({ id: src });

		return {
			id: like.id,
			page: await this.pageEntityService.pack(like.page ?? like.pageId, me),
		};
	}

	@bindThis
	public packMany(
		likes: any[],
		me: { id: MiUser['id'] },
	) {
		return Promise.all(likes.map(x => this.pack(x, me)));
	}
}
