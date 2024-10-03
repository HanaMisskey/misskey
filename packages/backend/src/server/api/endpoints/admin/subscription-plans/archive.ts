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
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		planId: { type: 'string', format: 'misskey:id' },
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

			await this.subscriptionPlansRepository.update({
				id: ps.planId,
			}, {
				isArchived: true,
			});

			moderationLogService.log(me, 'archiveSubscriptionPlan', {
				subscriptionPlanId: plan.id,
			});
		});
	}
}
