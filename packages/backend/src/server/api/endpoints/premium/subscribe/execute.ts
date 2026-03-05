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
					if (error.id === 'f4b8c624-4d20-4d14-a247-590d6251e5ce' || error.id === '7e1b4c51-0ef8-4d05-b2d6-3e9f8fc4c0b1') {
						throw new ApiError(meta.errors.subscriptionDisabled);
					}
					if (error.id === '85c4d10b-6a1a-4b9f-a4b2-4d0f1515b5cf') {
						throw new ApiError(meta.errors.sessionNotFound);
					}
					if (error.id === '4d1b36ee-3286-4f1f-8b72-8ed8c1c5c4ab') {
						throw new ApiError(meta.errors.sessionMismatch);
					}
					throw new ApiError(meta.errors.fetchFailed);
				}
				throw error;
			}
		});
	}
}
