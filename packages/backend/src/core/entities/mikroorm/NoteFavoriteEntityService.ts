import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { NoteFavoritesRepository } from '@/models/mikrooorm/_.js';
import type { MiUser } from '@/models/mikrooorm/User.js';
import type { MiNoteFavorite } from '@/models/mikrooorm/NoteFavorite.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { NoteEntityService } from './NoteEntityService.js';

@Injectable()
export class NoteFavoriteEntityService {
	constructor(
		@Inject(DI.noteFavoritesRepository)
		private noteFavoritesRepository: NoteFavoritesRepository,

		private noteEntityService: NoteEntityService,
		private idService: IdService,
	) {}

	@bindThis
	public async pack(
		src: MiNoteFavorite['id'] | MiNoteFavorite,
		me?: { id: MiUser['id'] } | null | undefined,
	) {
		const favorite =
			typeof src === 'object'
				? src
				: await this.noteFavoritesRepository.findOneOrFail({ where: { id: src } });

		return {
			id: favorite.id,
			createdAt: this.idService.parse(favorite.id).date.toISOString(),
			noteId: favorite.noteId,
			note: await this.noteEntityService.pack(favorite.note ?? favorite.noteId, me),
		};
	}

	@bindThis
	public packMany(
		favorites: MiNoteFavorite[],
		me: { id: MiUser['id'] },
	) {
		return Promise.all(favorites.map(favorite => this.pack(favorite, me)));
	}
}
