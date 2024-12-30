import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { SubscriptionPlansRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';

export const meta = {
	tags: ['admin', 'subscription-plans'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'write:admin:subscription-plans',
	secure: true,

	errors: {
		noSuchPlan: {
			message: 'No such plan.',
			code: 'NO_SUCH_PLAN',
			id: 'cd23ef55-09ad-428a-ac61-95a45e124b32',
		},
		planWithThisSlugAlreadyExists: {
			message: 'Plan with this slug already exists.',
			code: 'PLAN_WITH_THIS_SLUG_ALREADY_EXISTS',
			id: '17098d0d-514f-49c1-826f-27c06475d1b7',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		planId: { type: 'string', format: 'misskey:id' },
		slug: { type: 'string', pattern: '^[a-zA-Z0-9_-]+$', nullable: true },
		name: { type: 'string' },
		price: { type: 'integer' },
		currency: { type: 'string' },
		description: { type: 'string' },
		roleId: { type: 'string', format: 'misskey:id' },
	},
	required: ['planId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.subscriptionPlansRepository)
		private subscriptionPlansRepository: SubscriptionPlansRepository,

		private moderationLogService: ModerationLogService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const plan = await this.subscriptionPlansRepository.findOneByOrFail({
				id: ps.planId,
			});

			if (!plan) {
				throw new ApiError(meta.errors.noSuchPlan);
			}

			if (ps.slug) {
				const existingPlan = await this.subscriptionPlansRepository.findOneBy({ slug: ps.slug });
				if (existingPlan && existingPlan.id !== plan.id) {
					throw new ApiError(meta.errors.planWithThisSlugAlreadyExists);
				}
			}

			await this.subscriptionPlansRepository.update({
				id: ps.planId,
			}, {
				name: ps.name,
				slug: ps.slug,
				price: ps.price,
				currency: ps.currency,
				description: ps.description,
				roleId: ps.roleId,
			});

			const updated = await this.subscriptionPlansRepository.findOneByOrFail({ id: ps.planId });

			this.moderationLogService.log(me, 'updateSubscriptionPlan', {
				subscriptionPlanId: updated.id,
				before: plan,
				after: updated,
			});
		});
	}
}
