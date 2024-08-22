/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { UsersRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { BskMiAuthService } from '@/core/BskMiAuthService.js';

export const meta = {
	requireCredential: true,
	secure: true,
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private bskMiAuthService: BskMiAuthService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const res = await this.bskMiAuthService.verifyAuthSession(me.id);

			await this.usersRepository.update(me.id, {
				bskAccessToken: res.token,
				bskUserId: res.bskUserId,
			});
		});
	}
}
