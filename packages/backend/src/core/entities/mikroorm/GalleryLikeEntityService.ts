import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { GalleryLikesRepository } from '@/models/mikroorm/_.js';
import type { MiGalleryLike } from '@/models/mikroorm/GalleryLike.js';
import { bindThis } from '@/decorators.js';
import { GalleryPostEntityService } from './GalleryPostEntityService.js';

@Injectable()
export class GalleryLikeEntityService {
	constructor(
		@Inject(DI.galleryLikesRepository)
		private galleryLikesRepository: GalleryLikesRepository,

		private galleryPostEntityService: GalleryPostEntityService,
	) {}

	@bindThis
	public async pack(
		src: MiGalleryLike['id'] | MiGalleryLike,
		me?: any,
	) {
		const like = typeof src === 'object' ? src : await this.galleryLikesRepository.findOneOrFail({ id: src });

		return {
			id: like.id,
			post: await this.galleryPostEntityService.pack(like.post ?? like.postId, me),
		};
	}

	@bindThis
	public packMany(
		likes: any[],
		me: any,
	) {
		return Promise.all(likes.map(x => this.pack(x, me)));
	}
}
