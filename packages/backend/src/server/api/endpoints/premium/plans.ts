import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import type { Config } from '@/config.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	requireCredential: false,

	res: {
		type: 'array',
		items: {
			type: 'object',
			properties: {
				slug: { type: 'string' },
				displayName: { type: 'string' },
				description: { type: 'string' },
				monthlyPrice: { type: 'number' },
			},
			required: ['slug', 'displayName', 'description', 'monthlyPrice'],
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
	properties: {},
	required: [],
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
			const res = await this.httpRequestService.send(`${hanamiBilling.host}/internal/plans`, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${hanamiBilling.apiKey}`,
				},
			});

			if (!res.ok) {
				throw new ApiError(meta.errors.fetchFailed);
			}

			const plans = await res.json() as {
				plans: {
					slug: string;
					displayName: string;
					description: string;
					monthlyPrice: number;
					active: boolean;
				}[];
				requestId: string;
			};

			return plans.plans.filter(plan => plan.active).map(plan => ({
				slug: plan.slug,
				displayName: plan.displayName,
				description: plan.description,
				monthlyPrice: plan.monthlyPrice,
			}));
		});
	}
}
