import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { MetaService } from '@/core/MetaService.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['subscription'],

	requireCredential: true,
	kind: 'read:account',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			redirect: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					permanent: { type: 'boolean', optional: false, nullable: false },
					destination: { type: 'string', optional: false, nullable: false },
				},
			},
		},
	},

	errors: {
		unavailable: {
			message: 'Subscription unavailable.',
			code: 'UNAVAILABLE',
			id: 'ca50e7c1-2589-4360-a338-e729100af0c4',
		},

		sessionInvalid: {
			message: 'Session is invalid.',
			code: 'SESSION_INVALID',
			id: '4cee5674-69de-474d-aea7-00ed3c4fc8d7',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		returnPath: { type: 'string', pattern: '^\\/[a-zA-Z0-9_\\/-]+$', nullable: true },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.config)
		private config: Config,
		private metaService: MetaService,
	) {
		super(meta, paramDef, async () => {
			const instance = await this.metaService.fetch(true);
			if (!instance.enableSubscriptions) {
				throw new ApiError(meta.errors.unavailable);
			}
			if (!(this.config.stripe && this.config.stripe.customerPortalUrl)) {
				throw new ApiError(meta.errors.unavailable);
			}

			return {
				redirect: {
					permanent: false,
					destination: config.stripe?.customerPortalUrl,
				},
			};
		});
	}
}
