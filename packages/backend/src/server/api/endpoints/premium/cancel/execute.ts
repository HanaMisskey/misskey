import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { SubscriptionManagementService } from '@/core/SubscriptionManagementService.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';

export const meta = {
	requireCredential: true,
	secure: true,

	res: {},

	errors: {
		subscriptionDisabled: {
			message: 'Subscription is disabled.',
			code: 'SUBSCRIPTION_DISABLED',
			id: '745fadf0-d823-43b0-b529-b04542f5e234',
		},
		noActiveSubscription: {
			message: 'No active subscription.',
			code: 'NO_ACTIVE_SUBSCRIPTION',
			id: '2b4c8d1e-5f6a-4c9b-8d1e-2f3a4b5c6d7f',
		},
		currentPlanNotFound: {
			message: 'Current plan not found.',
			code: 'CURRENT_PLAN_NOT_FOUND',
			id: '3c5d9e2f-6a7b-4d0c-9e2f-3a4b5c6d7e8f',
		},
		fetchFailed: {
			message: 'Failed to fetch plans from Hanami Billing.',
			code: 'FETCH_FAILED',
			id: '4c4ec52c-67be-4ccd-8fb6-e92d6e98eb96',
		},
		sessionNotFound: {
			message: 'Session not found or expired.',
			code: 'SESSION_NOT_FOUND',
			id: '28975c50-73c2-4c5f-b9bb-3e6fc1c62da1',
		},
		sessionMismatch: {
			message: 'Session data does not match the request.',
			code: 'SESSION_MISMATCH',
			id: '730d2a12-b174-40af-8bda-d8aac0cf109a',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sessionId: { type: 'string' },
		immediate: { type: 'boolean' },
	},
	required: ['sessionId', 'immediate'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private subscriptionManagementService: SubscriptionManagementService,
	) {
		super(meta, paramDef, async (ps, me) => {
			try {
				await this.subscriptionManagementService.executePlanCancelSession(me.id, ps.immediate, ps.sessionId);
			} catch (error) {
				if (error instanceof IdentifiableError) {
					switch (error.id) {
						case 'f4b8c624-4d20-4d14-a247-590d6251e5ce':
							throw new ApiError(meta.errors.subscriptionDisabled);
						case '3f4b2f7a-7e87-4fb4-92a9-8c7a2f6f2cb5':
							throw new ApiError(meta.errors.noActiveSubscription);
						case '6d7c6d1b-6b2f-4f2b-9a48-1b4ef6c8fefb':
							throw new ApiError(meta.errors.currentPlanNotFound);
						case '0c705fa7-86d2-48aa-8b34-1cd4c6e6e1c8':
							throw new ApiError(meta.errors.sessionNotFound);
						case 'd7f09f88-3fd1-4cd1-9b53-9f8c0e3b3f72':
							throw new ApiError(meta.errors.sessionMismatch);
						default:
							throw new ApiError(meta.errors.fetchFailed);
					}
				}
				throw error;
			}
		});
	}
}
