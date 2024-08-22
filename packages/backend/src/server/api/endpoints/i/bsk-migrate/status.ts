/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';

export const meta = {
	requireCredential: true,
	secure: true,

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			linked: {
				type: 'boolean',
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
	) {
		super(meta, paramDef, async (ps, me) => {
			return {
				linked: me.bskUserId !== null && me.bskAccessToken !== null,
			};
		});
	}
}
