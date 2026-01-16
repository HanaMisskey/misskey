import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { HanamiSearchService } from '@/core/hanamisearch/HanamiSearchService.js';

export const meta = {
	tags: ['notes'],

	requireCredential: false,
	requiredRolePolicy: 'canSearchWithHanamiSearchV2',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			items: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'Note',
				},
			},
			nextToken: {
				type: 'string',
				optional: true, nullable: true,
			},
		}
	},

	errors: {
		unavailable: {
			message: 'Search of notes unavailable.',
			code: 'UNAVAILABLE',
			id: '0b44998d-77aa-4427-80d0-d2c9b8523011',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		query: { type: 'string' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		nextToken: { type: 'string', nullable: true },
		host: {
			type: 'string',
			description: 'The local host is represented with `.`.',
		},
		userId: { type: 'string', format: 'misskey:id', nullable: true, default: null },
		channelId: { type: 'string', format: 'misskey:id', nullable: true, default: null },
		onlyWithFiles: { type: 'boolean', default: false },
	},
	required: ['query'],
} as const;

// TODO: ロジックをサービスに切り出す

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private hanamiSearchService: HanamiSearchService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const sres = await this.hanamiSearchService.searchNote(ps.query, me, {
				userId: ps.userId,
				channelId: ps.channelId,
				host: ps.host,
				preferredMethod: 'hanamisearchv2',
				onlyWithFiles: ps.onlyWithFiles,
			}, {
				// TODO: nextToken対応
				limit: ps.limit,
			});

			return {
				items: sres,
				nextToken: 'foo', // ← 返せるものがなくなった（終わりに到達した）らnullにすること
			};
		});
	}
}
