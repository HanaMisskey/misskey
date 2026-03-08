import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { SubscriptionManagementService } from '@/core/SubscriptionManagementService.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';

export const meta = {
	requireCredential: true,
	secure: true,

	res: {
		type: 'object',
		properties: {
			sessionId: { type: 'string' },
			preview: {
				type: 'object',
				properties: {
					currentPlanSlug: { type: 'string' },
					effectiveAt: { type: 'string' },
					immediate: { type: 'boolean' },
				},
				required: ['currentPlanSlug', 'effectiveAt', 'immediate'],
			},
		},
		required: ['sessionId', 'preview'],
	},

	errors: {
		subscriptionDisabled: {
			message: 'Subscription is disabled.',
			code: 'SUBSCRIPTION_DISABLED',
			id: '745fadf0-d823-43b0-b529-b04542f5e234',
		},
		noActiveSubscription: {
			message: 'No active subscription.',
			code: 'NO_ACTIVE_SUBSCRIPTION',
			id: '9f2a7c3d-4e5b-4a7d-8c1e-2f3a4b5c6d7e',
		},
		currentPlanNotFound: {
			message: 'Current plan not found.',
			code: 'CURRENT_PLAN_NOT_FOUND',
			id: '0a3b8d4e-5f6a-4b8c-9d2e-3f4a5b6c7d8e',
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
		immediate: { type: 'boolean' },
	},
	required: ['immediate'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private subscriptionManagementService: SubscriptionManagementService,
	) {
		super(meta, paramDef, async (ps, me) => {
			try {
				return await this.subscriptionManagementService.startPlanCancelSession(me.id, ps.immediate);
			} catch (error) {
				if (error instanceof IdentifiableError) {
					switch (error.id) {
						case 'f4b8c624-4d20-4d14-a247-590d6251e5ce':
							throw new ApiError(meta.errors.subscriptionDisabled);
						case '3f4b2f7a-7e87-4fb4-92a9-8c7a2f6f2cb5':
							throw new ApiError(meta.errors.noActiveSubscription);
						case '6d7c6d1b-6b2f-4f2b-9a48-1b4ef6c8fefb':
							throw new ApiError(meta.errors.currentPlanNotFound);
						default:
							throw new ApiError(meta.errors.fetchFailed);
					}
				}
				throw error;
			}
		});
	}
}
