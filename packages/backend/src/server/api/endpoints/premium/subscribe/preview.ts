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
			sessionId: { type: 'string' },
			preview: {
				oneOf: [
					{
						type: 'object',
						properties: {
							type: { type: 'string', enum: ['subscribe'] },
							targetPlanSlug: { type: 'string' },
							targetPlanDisplayName: { type: 'string' },
							targetPlanMonthlyPrice: { type: 'number' },
							currency: { type: 'string' },
						},
						required: ['type', 'targetPlanSlug', 'targetPlanDisplayName', 'targetPlanMonthlyPrice', 'currency'],
					},
					{
						type: 'object',
						properties: {
							type: { type: 'string', enum: ['upgrade'] },
							currentPlanSlug: { type: 'string' },
							newPlanSlug: { type: 'string' },
							amountDue: { type: 'number' },
							credit: { type: 'number' },
							newPlanCharge: { type: 'number' },
							currency: { type: 'string' },
							prorationDate: { type: 'number' },
						},
						required: ['type', 'currentPlanSlug', 'newPlanSlug', 'amountDue', 'credit', 'newPlanCharge', 'currency', 'prorationDate'],
					},
					{
						type: 'object',
						properties: {
							type: { type: 'string', enum: ['downgrade'] },
							currentPlanSlug: { type: 'string' },
							newPlanSlug: { type: 'string' },
							effectiveAt: { type: 'string' },
							currentPlanMonthlyPrice: { type: 'number' },
							newPlanMonthlyPrice: { type: 'number' },
							currency: { type: 'string' },
						},
						required: ['type', 'currentPlanSlug', 'newPlanSlug', 'effectiveAt', 'currentPlanMonthlyPrice', 'newPlanMonthlyPrice', 'currency'],
					},
					{
						type: 'object',
						properties: {
							type: { type: 'string', enum: ['cancel_downgrade'] },
							currentPlanSlug: { type: 'string' },
							pendingDowngradeTargetSlug: { type: 'string' },
							pendingDowngradeEffectiveAt: { type: 'string' },
						},
						required: ['type', 'currentPlanSlug', 'pendingDowngradeTargetSlug', 'pendingDowngradeEffectiveAt'],
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
