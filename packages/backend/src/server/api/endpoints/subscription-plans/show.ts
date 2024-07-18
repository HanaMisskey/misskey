import { Inject, Injectable } from "@nestjs/common";
import type { SubscriptionPlansRepository } from "@/models/_.js";
import { Endpoint } from "@/server/api/endpoint-base.js";
import { DI } from "@/di-symbols.js";
import { SubscriptionPlanEntityService } from "@/core/entities/SubscriptionPlanEntityService.js";

export const meta = {
	tags: ['subscription-plans'],

	requireCredential: false,

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'SubscriptionPlan',
	},

	errors: {
		NO_SUCH_PLAN: {
			message: 'No such plan.',
			code: 'NO_SUCH_PLAN',
			id: 'd9f0d5c1-0b5b-4b7a-9d2c-1c1c5c6d1d1d',
		},
	},

} as const;

export const paramDef = {
	type: 'object',
	properties: {
		planId: { type: 'string', format: 'misskey:id' },
	},
	required: [
		'planId',
	],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.subscriptionPlansRepository)
		private subscriptionPlansRepository: SubscriptionPlansRepository,
		private subscriptionPlanEntityService: SubscriptionPlanEntityService,
	) {
		super(meta, paramDef, async (ps) => {
			const subscriptionPlan = await this.subscriptionPlansRepository.findOneByOrFail({ id: ps.planId });
			return await this.subscriptionPlanEntityService.pack(subscriptionPlan, null);
		});
	}
}
