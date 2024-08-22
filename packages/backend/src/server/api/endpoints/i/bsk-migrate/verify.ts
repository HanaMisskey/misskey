/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { UsersRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { BskMiAuthService } from '@/core/BskMiAuthService.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { ApiError } from '../../../error.js';

export const meta = {
	requireCredential: true,
	secure: true,

	errors: {
		sessionNotFound: {
			message: 'Session not found',
			code: 'SESSION_NOT_FOUND',
			id: '83a41880-4ad3-4571-a499-3edc1b2b191d',
		},
		verifyFailed: {
			message: 'Failed to verify session',
			code: 'VERIFY_FAILED',
			id: '93ab6634-16b3-46b4-9ffb-b2d3cf3d5190',
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
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private bskMiAuthService: BskMiAuthService,
	) {
		super(meta, paramDef, async (ps, me) => {
			try {
				const res = await this.bskMiAuthService.verifyAuthSession(me.id);

				await this.usersRepository.update(me.id, {
					bskAccessToken: res.token,
					bskUserId: res.bskUserId,
				});
			} catch (error) {
				if (error instanceof IdentifiableError) {
					if (error.id === '83a41880-4ad3-4571-a499-3edc1b2b191d') {
						throw new ApiError(meta.errors.sessionNotFound);
					} else if (error.id === '93ab6634-16b3-46b4-9ffb-b2d3cf3d5190') {
						throw new ApiError(meta.errors.verifyFailed);
					}
				}
			}
		});
	}
}
