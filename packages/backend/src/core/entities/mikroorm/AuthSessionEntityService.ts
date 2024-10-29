import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { AuthSessionsRepository } from '@/models/mikroorm/_.js';
import { awaitAll } from '@/misc/prelude/await-all.js';
import type { MiAuthSession } from '@/models/mikroorm/AuthSession.js';
import type { MiUser } from '@/models/mikroorm/User.js';
import { bindThis } from '@/decorators.js';
import { AppEntityService } from './AppEntityService.js';

@Injectable()
export class AuthSessionEntityService {
	constructor(
		@Inject(DI.authSessionsRepository)
		private authSessionsRepository: AuthSessionsRepository,

		private appEntityService: AppEntityService,
	) {}

	@bindThis
	public async pack(
		src: MiAuthSession['id'] | MiAuthSession,
		me?: { id: MiUser['id'] } | null | undefined,
	) {
		const session = typeof src === 'object'
			? src
			: await this.authSessionsRepository.findOneOrFail({ id: src as MiAuthSession['id'] });

		return await awaitAll({
			id: session.id,
			app: this.appEntityService.pack(session.appId as MiApp['id'], me),
			token: session.token,
		});
	}
}
