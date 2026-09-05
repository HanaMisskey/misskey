/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { HanamiSearchV2Error, HanamiSearchV2Service } from '@/core/hanamisearch/HanamiSearchV2Service.js';

export const meta = {
	tags: ['notes'],
	requireCredential: true,
	kind: 'read:account',
	requiredRolePolicy: 'canSearchWithHanamiSearchV2',
	res: {
		type: 'object', optional: false, nullable: false,
		properties: {
			notes: { type: 'array', optional: false, nullable: false, items: { type: 'object', optional: false, nullable: false, ref: 'Note' } },
			nextCursor: { type: 'string', optional: false, nullable: true },
		},
	},
	errors: {
		unavailable: { message: 'HanamiSearch v2 is unavailable.', code: 'UNAVAILABLE', id: '3de6c729-d637-492c-b8f8-12019551e288', kind: 'server', httpStatusCode: 503 },
		invalidCursor: { message: 'Invalid HanamiSearch v2 cursor.', code: 'INVALID_CURSOR', id: 'd441a984-cc17-44d7-a868-f42c6008e006' },
		invalidQuery: { message: 'Invalid HanamiSearch v2 query.', code: 'INVALID_QUERY', id: '2289bc61-ad2e-408b-a63d-526b65e4c188' },
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		query: { type: 'string' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		cursor: { type: 'string', nullable: true, minLength: 1, maxLength: 4096 },
		host: { type: 'string', description: 'The local host is represented with `.`.' },
		userId: { type: 'string', format: 'misskey:id', nullable: true, default: null },
		channelId: { type: 'string', format: 'misskey:id', nullable: true, default: null },
		onlyWithFiles: { type: 'boolean', default: false },
	},
	required: ['query'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private hanamiSearchV2Service: HanamiSearchV2Service) {
		super(meta, paramDef, async (ps, me) => {
			try {
				return await this.hanamiSearchV2Service.searchNote(ps.query, me, {
					userId: ps.userId, channelId: ps.channelId, host: ps.host, onlyWithFiles: ps.onlyWithFiles,
				}, { limit: ps.limit, cursor: ps.cursor });
			} catch (error) {
				if (error instanceof HanamiSearchV2Error && error.code === 'INVALID_CURSOR') throw new ApiError(meta.errors.invalidCursor);
				if (error instanceof HanamiSearchV2Error && error.code === 'INVALID_QUERY') throw new ApiError(meta.errors.invalidQuery);
				throw new ApiError(meta.errors.unavailable);
			}
		});
	}
}
