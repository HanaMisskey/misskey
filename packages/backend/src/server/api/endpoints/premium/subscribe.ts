import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import type { Config } from '@/config.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	requireCredential: true,
	secure: true,
	prohibitMoved: true,

	res: {
		type: 'object',
		properties: {
			url: { type: 'string' },
		},
		required: ['url'],
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
		returnUrl: { type: 'string' },
	},
	required: ['planSlug', 'returnUrl'],
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
			const res = await this.httpRequestService.send(`${hanamiBilling.host}/internal/checkout`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${hanamiBilling.apiKey}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					misskeyUserId: me.id,
					slug: ps.planSlug,
					returnUrl: ps.returnUrl,
				}),
			});

			if (!res.ok) {
				throw new ApiError(meta.errors.fetchFailed);
			}

			const pRes = await res.json() as {
				url: string;
				requestId: string;
			};

			return {
				url: pRes.url,
			};
		});
	}
}
