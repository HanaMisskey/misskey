import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import type { Config } from '@/config.js';
import { DI } from '@/di-symbols.js';

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
		@Inject(DI.config)
		private config: Config,

		private httpRequestService: HttpRequestService,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (!this.config.hanamiBilling) {
				throw new ApiError(meta.errors.subscriptionDisabled);
			}

			const { hanamiBilling } = this.config;
			const res = await this.httpRequestService.send(`${hanamiBilling.host}/internal/status?misskeyUserId=${encodeURIComponent(me.id)}`, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${hanamiBilling.apiKey}`,
				},
			});

			if (!res.ok) {
				throw new ApiError(meta.errors.fetchFailed);
			}

			const pRes = await res.json() as {
				misskeyUserId: string;
				subscription: {
					plan: {
						slug: string;
						displayName: string;
						description: string;
						monthlyPrice: number;
					};
					status: 'incomplete' | 'incomplete_expired' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'paused';
					currentPeriodEnd: string;
					cancelAtPeriodEnd: boolean;
				} | null;
				roleId: string | null;
				requestId: string;
			};

			return {
				//@ts-expect-error
				misskeyUserId: pRes.misskeyUserId,
				subscription: pRes.subscription,
				roleId: pRes.roleId,
			};
		});
	}
}
