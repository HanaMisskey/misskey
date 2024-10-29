import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { AccessTokensRepository, AppsRepository } from '@/models/mikroorm/_.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiApp } from '@/models/mikroorm/App.js';
import type { MiUser } from '@/models/mikroorm/User.js';
import { bindThis } from '@/decorators.js';

@Injectable()
export class AppEntityService {
	constructor(
		@Inject(DI.appsRepository)
		private appsRepository: AppsRepository,

		@Inject(DI.accessTokensRepository)
		private accessTokensRepository: AccessTokensRepository,
	) {}

	@bindThis
	public async pack(
		src: MiApp['id'] | MiApp,
		me?: { id: MiUser['id'] } | null | undefined,
		options?: {
			detail?: boolean,
			includeSecret?: boolean,
			includeProfileImageIds?: boolean
		},
	): Promise<Packed<'App'>> {
		const opts = {
			detail: false,
			includeSecret: false,
			includeProfileImageIds: false,
			...options,
		};

		const app = typeof src === 'object'
			? src
			: await this.appsRepository.findOneOrFail({ id: src as MiApp['id'] });

		return {
			id: app.id,
			name: app.name,
			callbackUrl: app.callbackUrl,
			permission: app.permission,
			...(opts.includeSecret ? { secret: app.secret } : {}),
			...(me ? {
				isAuthorized: await this.accessTokensRepository.count({
					appId: app.id,
					userId: me.id as MiUser['id'],
				}).then(count => count > 0),
			} : {}),
		};
	}
}
