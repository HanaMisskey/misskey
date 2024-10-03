import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { SubscriptionPlansRepository } from '@/models/_.js';
import { MiSubscriptionPlan, MiUser } from '@/models/_.js';
import { RoleEntityService } from '@/core/entities/RoleEntityService.js';
import { bindThis } from '@/decorators.js';
import { Packed } from '@/misc/json-schema.js';
import { awaitAll } from '@/misc/prelude/await-all.js';

@Injectable()
export class SubscriptionPlanEntityService {
	constructor(
		@Inject(DI.subscriptionPlansRepository)
		private subscriptionPlansRepository: SubscriptionPlansRepository,

		private roleEntityService: RoleEntityService,
	) {
	}

	@bindThis
	public async pack(
		src: MiSubscriptionPlan['id'] | MiSubscriptionPlan,
		me: { id: MiUser['id'] } | null | undefined,
	) : Promise<Packed<'SubscriptionPlan'>> {
		const subscriptionPlan = typeof src === 'object' ? src : await this.subscriptionPlansRepository.findOneByOrFail({ id: src });

		return await awaitAll({
			id: subscriptionPlan.id,
			name: subscriptionPlan.name,
			price: subscriptionPlan.price,
			currency: subscriptionPlan.currency,
			description: subscriptionPlan.description,
			stripePriceId: subscriptionPlan.stripePriceId,
			roleId: subscriptionPlan.roleId,
			role: await this.roleEntityService.pack(subscriptionPlan.roleId, me),
			isArchived: subscriptionPlan.isArchived,
		});
	}
}
