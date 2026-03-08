import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { SubscriptionManagementService } from '@/core/SubscriptionManagementService.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';

export const meta = {
	requireCredential: true,
	secure: true,
	prohibitMoved: true,

	res: {
		type: 'object',
		properties: {
			url: { type: 'string' },
		},
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
			id: '1f3c8a4b-6d5e-4a2f-9b7c-3d1e5f7a9b2c',
		},
		currentPlanNotFound: {
			message: 'Current plan not found.',
			code: 'CURRENT_PLAN_NOT_FOUND',
			id: '2a7c1f5b-4d6e-4b3a-9c8d-5e1f7a2b3c4d',
		},
		targetPlanNotFound: {
			message: 'Target plan not found.',
			code: 'TARGET_PLAN_NOT_FOUND',
			id: '3b8d2a6c-5e7f-4c1a-9d2e-6f3a8b1c2d3e',
		},
		samePlan: {
			message: 'Already on the same plan.',
			code: 'SAME_PLAN',
			id: '4c9e3b7d-6f8a-4d2b-9e3f-7a4b9c2d3e4f',
		},
		sameTier: {
			message: 'Plans are in the same tier.',
			code: 'SAME_TIER',
			id: '5d1f4c8e-7a9b-4e3c-9f4a-8b5c1d2e3f4a',
		},
		notAnUpgrade: {
			message: 'Selected plan is not an upgrade.',
			code: 'NOT_AN_UPGRADE',
			id: '6e2a5d9f-8b1c-4f4d-9a5b-9c6d2e3f4a5b',
		},
		notADowngrade: {
			message: 'Selected plan is not a downgrade.',
			code: 'NOT_A_DOWNGRADE',
			id: '7f3b6e1a-9c2d-4a5e-9b6c-1d7e3f4a5b6c',
		},
		noPendingDowngrade: {
			message: 'No pending downgrade to cancel.',
			code: 'NO_PENDING_DOWNGRADE',
			id: '8a4c7f2b-1d3e-4b6f-9c7d-2e8f4a5b6c7d',
		},
		stripePriceNotFound: {
			message: 'Plan price not found.',
			code: 'STRIPE_PRICE_NOT_FOUND',
			id: '9b5d8a3c-2e4f-4c7a-9d8e-3f9a5b6c7d8e',
		},
		noSubscriptionItems: {
			message: 'Subscription items not found.',
			code: 'NO_SUBSCRIPTION_ITEMS',
			id: '0c6e9b4d-3f5a-4d8b-9e9f-4a0b6c7d8e9f',
		},
		invalidRequest: {
			message: 'Invalid request.',
			code: 'INVALID_REQUEST',
			id: '1d7f0c5e-4a6b-4e9c-9f0a-5b1c7d8e9f0a',
		},
		missingTargetPlan: {
			message: 'Target plan is required.',
			code: 'MISSING_TARGET_PLAN',
			id: '2e8a1d6f-5b7c-4f0d-9a1b-6c2d8e9f0a1b',
		},
		missingReturnUrl: {
			message: 'Return URL is required.',
			code: 'MISSING_RETURN_URL',
			id: '3f9b2e7a-6c8d-4a1e-9b2c-7d3e9f0a1b2c',
		},
		invalidReturnUrl: {
			message: 'Return URL is invalid.',
			code: 'INVALID_RETURN_URL',
			id: '4a0c3f8b-7d9e-4b2f-9c3d-8e4f0a1b2c3d',
		},
		downgradeAlreadyPending: {
			message: 'A downgrade is already pending.',
			code: 'DOWNGRADE_ALREADY_PENDING',
			id: '5b1d4a9c-8e0f-4c3a-9d4e-9f5a1b2c3d4e',
		},
		scheduleAlreadyExists: {
			message: 'A schedule already exists.',
			code: 'SCHEDULE_ALREADY_EXISTS',
			id: '6c2e5b0d-9f1a-4d4b-9e5f-0a6b2c3d4e5f',
		},
		fetchFailed: {
			message: 'Failed to fetch plans from Hanami Billing.',
			code: 'FETCH_FAILED',
			id: '4c4ec52c-67be-4ccd-8fb6-e92d6e98eb96',
		},
		sessionNotFound: {
			message: 'Session not found or expired.',
			code: 'SESSION_NOT_FOUND',
			id: '124246e5-6c81-4bc4-ab04-d6d98574cfb0',
		},
		sessionMismatch: {
			message: 'Session data does not match the request.',
			code: 'SESSION_MISMATCH',
			id: '5902bd77-4ac4-4b44-bb4e-2bb2001139d8',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		planSlug: { type: 'string' },
		sessionId: { type: 'string' },
		returnUrl: { type: 'string' },
	},
	required: ['planSlug', 'sessionId', 'returnUrl'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private subscriptionManagementService: SubscriptionManagementService,
	) {
		super(meta, paramDef, async (ps, me) => {
			try {
				const res = await this.subscriptionManagementService.executePlanChangeSession(me.id, ps.planSlug, ps.sessionId, ps.returnUrl);
				return {
					url: 'url' in res ? res.url : undefined,
				};
			} catch (error) {
				if (error instanceof IdentifiableError) {
					switch (error.id) {
						case 'f4b8c624-4d20-4d14-a247-590d6251e5ce':
							throw new ApiError(meta.errors.subscriptionDisabled);
						case '3f4b2f7a-7e87-4fb4-92a9-8c7a2f6f2cb5':
							throw new ApiError(meta.errors.noActiveSubscription);
						case '6d7c6d1b-6b2f-4f2b-9a48-1b4ef6c8fefb':
							throw new ApiError(meta.errors.currentPlanNotFound);
						case '1c2e8d53-4f66-4c5f-9b6a-0b3f4322e5b8':
							throw new ApiError(meta.errors.targetPlanNotFound);
						case '54f0b3a6-3f64-4a8d-8e6a-3e8b15c6f9af':
							throw new ApiError(meta.errors.samePlan);
						case '9d7e7a9d-1df4-4e64-8b8c-9c3b3f9d9e8a':
							throw new ApiError(meta.errors.sameTier);
						case '2c1a4b95-3f5d-4e03-9d26-0c6f17af8f78':
							throw new ApiError(meta.errors.notAnUpgrade);
						case 'b1a5f2a4-2f7b-4f0b-9a3a-8f6f28d6c8b7':
							throw new ApiError(meta.errors.notADowngrade);
						case 'f9f1b0b8-3d52-4c1b-8f57-2a4b78f2cfb1':
							throw new ApiError(meta.errors.noPendingDowngrade);
						case '0f8d8f6a-2a1b-4ed2-9c47-6a4f0c5c9f2e':
							throw new ApiError(meta.errors.stripePriceNotFound);
						case '7e5b9f7c-6c4b-4a2e-9e8f-6b3a1c2f5a7b':
							throw new ApiError(meta.errors.noSubscriptionItems);
						case 'e6c1a4a5-2e5a-4c9a-8e4f-7b6a2c9f3d1e':
							throw new ApiError(meta.errors.invalidRequest);
						case '8c2a5f6e-3d7a-4b3f-9f6d-1c2b5e7f9a3d':
							throw new ApiError(meta.errors.missingTargetPlan);
						case 'd2c9b8a1-5f6e-4f2a-9b8c-3a1d5f7e9c2b':
							throw new ApiError(meta.errors.missingReturnUrl);
						case '4a3e6f8b-2c5d-4f9a-8b7c-1d3e5f7a9c4b':
							throw new ApiError(meta.errors.invalidReturnUrl);
						case 'b5a7c9d2-6e4f-4b2a-9c3d-5f7e1a2b4c6d':
							throw new ApiError(meta.errors.downgradeAlreadyPending);
						case 'c7d2a5b9-4e6f-4c2b-8a3d-7f1e5b2c9d4a':
							throw new ApiError(meta.errors.scheduleAlreadyExists);
						case '85c4d10b-6a1a-4b9f-a4b2-4d0f1515b5cf':
							throw new ApiError(meta.errors.sessionNotFound);
						case '4d1b36ee-3286-4f1f-8b72-8ed8c1c5c4ab':
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
