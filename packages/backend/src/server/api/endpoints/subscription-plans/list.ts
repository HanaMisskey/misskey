import { Inject, Injectable } from "@nestjs/common";
import { Endpoint } from "@/server/api/endpoint-base.js";
import type { RolesRepository, SubscriptionPlansRepository } from "@/models/_.js";
import { DI } from "@/di-symbols.js";
import { SubscriptionPlanEntityService } from "@/core/entities/SubscriptionPlanEntityService.js";

export const meta = {
	tags: ['subscription-plans'],

	requireCredential: false,

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'SubscriptionPlan',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
	},
	required: [
	],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.subscriptionPlansRepository)
		private subscriptionPlansRepository: SubscriptionPlansRepository,
		@Inject(DI.rolesRepository)
		private rolesRepository: RolesRepository,
	) {
		super(meta, paramDef, async (ps) => {
			const subscriptionPlans = await this.subscriptionPlansRepository.find();
			const packed = subscriptionPlans.map(async subscriptionPlan => {
				const role = await this.rolesRepository.findOneByOrFail({ id: subscriptionPlan.roleId });
				return {
					id: subscriptionPlan.id,
					name: subscriptionPlan.name,
					price: subscriptionPlan.price,
					currency: subscriptionPlan.currency,
					description: subscriptionPlan.description,
					stripePriceId: subscriptionPlan.stripePriceId,
					roleId: subscriptionPlan.roleId,
					role: {
						id: role.id,
						name: role.name,
						color: role.color,
						iconUrl: role.iconUrl,
						description: role.description,
						isModerator: role.isModerator,
						isAdministrator: role.isAdministrator,
						displayOrder: role.displayOrder,
					},
					isArchived: subscriptionPlan.isArchived,
				};
			});

			return await Promise.all(packed);
		});
	}
}
