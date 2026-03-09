import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { SubscriptionManagementService, subscriptionPreviewPlanSchema } from '@/core/SubscriptionManagementService.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';

export const meta = {
	requireCredential: true,
	secure: true,
	prohibitMoved: true,

	res: {
		type: 'object',
		properties: {
			sessionId: { type: 'string' },
			preview: {
				oneOf: [
					{
						type: 'object',
						properties: {
							type: { type: 'string', enum: ['subscribe'] },
							currentPlan: {
								...subscriptionPreviewPlanSchema,
								nullable: true,
							},
							newPlan: subscriptionPreviewPlanSchema,
							currency: { type: 'string' },
						},
						required: ['type', 'currentPlan', 'newPlan', 'currency'],
					},
					{
						type: 'object',
						properties: {
							type: { type: 'string', enum: ['upgrade'] },
							currentPlan: subscriptionPreviewPlanSchema,
							newPlan: subscriptionPreviewPlanSchema,
							amountDue: { type: 'number' },
							credit: { type: 'number' },
							newPlanCharge: { type: 'number' },
							currency: { type: 'string' },
							prorationDate: { type: 'number' },
						},
						required: ['type', 'currentPlan', 'newPlan', 'amountDue', 'credit', 'newPlanCharge', 'currency', 'prorationDate'],
					},
					{
						type: 'object',
						properties: {
							type: { type: 'string', enum: ['downgrade'] },
							currentPlan: subscriptionPreviewPlanSchema,
							newPlan: subscriptionPreviewPlanSchema,
							effectiveAt: { type: 'string' },
							currentPlanMonthlyPrice: { type: 'number' },
							newPlanMonthlyPrice: { type: 'number' },
							currency: { type: 'string' },
						},
						required: ['type', 'currentPlan', 'newPlan', 'effectiveAt', 'currentPlanMonthlyPrice', 'newPlanMonthlyPrice', 'currency'],
					},
					{
						type: 'object',
						properties: {
							type: { type: 'string', enum: ['cancel_downgrade'] },
							currentPlan: subscriptionPreviewPlanSchema,
							newPlan: subscriptionPreviewPlanSchema,
							pendingDowngradePlan: subscriptionPreviewPlanSchema,
							pendingDowngradeEffectiveAt: { type: 'string' },
						},
						required: ['type', 'currentPlan', 'pendingDowngradePlan', 'pendingDowngradeEffectiveAt'],
					},
				],
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
			id: '5a8b2c6f-1d4e-4f7c-9b5d-2c6f1a8b3d7e',
		},
		currentPlanNotFound: {
			message: 'Current plan not found.',
			code: 'CURRENT_PLAN_NOT_FOUND',
			id: '7c1f2b6a-5d4e-4f1b-9a7c-3b6d2f1a8c5e',
		},
		targetPlanNotFound: {
			message: 'Target plan not found.',
			code: 'TARGET_PLAN_NOT_FOUND',
			id: '1a6b3c7d-4e5f-4a8b-9c1d-2e3f4a5b6c7d',
		},
		samePlan: {
			message: 'Already on the same plan.',
			code: 'SAME_PLAN',
			id: '3b7d1a6c-2f4e-4c5b-9a8d-6f2b1c3a4d5e',
		},
		sameTier: {
			message: 'Plans are in the same tier.',
			code: 'SAME_TIER',
			id: '9a5c3b7d-6e2f-4b1a-8c4d-7e5f2a1b3c4d',
		},
		notAnUpgrade: {
			message: 'Selected plan is not an upgrade.',
			code: 'NOT_AN_UPGRADE',
			id: '4c6d2a7b-5e8f-4a1c-9b3d-2f6a7c8d1e4f',
		},
		notADowngrade: {
			message: 'Selected plan is not a downgrade.',
			code: 'NOT_A_DOWNGRADE',
			id: '8b4d1c6a-7f2e-4b5a-9c3d-1e6f7a2b4c5d',
		},
		noPendingDowngrade: {
			message: 'No pending downgrade to cancel.',
			code: 'NO_PENDING_DOWNGRADE',
			id: '6d3a8c1f-2b4e-4f5a-9c7d-1e2f3a4b5c6d',
		},
		stripePriceNotFound: {
			message: 'Plan price not found.',
			code: 'STRIPE_PRICE_NOT_FOUND',
			id: '2f6a8c3d-4e5b-4a7c-9d1e-3f2a6b7c8d9e',
		},
		noSubscriptionItems: {
			message: 'Subscription items not found.',
			code: 'NO_SUBSCRIPTION_ITEMS',
			id: '5e1a7c2b-6d4f-4a9c-8b3d-1f2a3c4d5e6f',
		},
		invalidRequest: {
			message: 'Invalid request.',
			code: 'INVALID_REQUEST',
			id: '7e4b1c6a-2d3f-4a5c-9b7e-1c2d3f4a5b6c',
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
		planSlug: { type: 'string' },
	},
	required: ['planSlug'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private subscriptionManagementService: SubscriptionManagementService,
	) {
		super(meta, paramDef, async (ps, me) => {
			try {
				return await this.subscriptionManagementService.startPlanChangeSession(me.id, ps.planSlug) as any;
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
						default:
							throw new ApiError(meta.errors.fetchFailed);
					}
				}
				throw error;
			}
		});
	}
}
