import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { SubscriptionManagementService } from '@/core/SubscriptionManagementService.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';

export const meta = {
	requireCredential: true,
	kind: 'read:account',

	res: {
		type: 'object',
		properties: {
			subscription: {
				type: 'object',
				optional: false, nullable: true,
				properties: {
					plan: {
						type: 'object',
						properties: {
							slug: { type: 'string' },
							displayName: { type: 'string' },
							description: { type: 'string' },
							monthlyPrice: { type: 'number' },
						},
						required: ['slug', 'displayName', 'description', 'monthlyPrice'],
					},
					status: {
						type: 'string',
						enum: ['incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused'],
					},
					currentPeriodEnd: { type: 'string' },
					cancelAtPeriodEnd: { type: 'boolean' },
				},
			},
			roleId: { type: 'string', nullable: true },
		},
	},

	errors: {
		subscriptionDisabled: {
			message: 'Subscription is disabled.',
			code: 'SUBSCRIPTION_DISABLED',
			id: '745fadf0-d823-43b0-b529-b04542f5e234',
		},
		fetchFailed: {
			message: 'Failed to fetch plans from Hanami Billing.',
			code: 'FETCH_FAILED',
			id: '4c4ec52c-67be-4ccd-8fb6-e92d6e98eb96',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
	},
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private subscriptionManagementService: SubscriptionManagementService,
	) {
		super(meta, paramDef, async (ps, me) => {
			try {
				const { subscription, roleId } = await this.subscriptionManagementService.getSubscriptionStatus(me.id);
				return {
					subscription,
					roleId,
				};
			} catch (error) {
				if (error instanceof IdentifiableError) {
					if (error.id === 'f4b8c624-4d20-4d14-a247-590d6251e5ce' || error.id === '7e1b4c51-0ef8-4d05-b2d6-3e9f8fc4c0b1') {
						throw new ApiError(meta.errors.subscriptionDisabled);
					}
					throw new ApiError(meta.errors.fetchFailed);
				}
				throw error;
			}
		});
	}
}
