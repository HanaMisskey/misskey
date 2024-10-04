/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { BskMiAuthService } from '@/core/BskMiAuthService.js';

export const meta = {
	requireCredential: true,
	secure: true,

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			sessionId: {
				type: 'string',
				optional: false, nullable: false,
			},
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
		private bskMiAuthService: BskMiAuthService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const sessionId = await this.bskMiAuthService.createAuthSession(me.id);

			return {
				sessionId,
			};
		});
	}
}
