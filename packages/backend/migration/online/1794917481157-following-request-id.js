/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { FollowingRequestId1794917481157 as OriginalFollowingRequestId } from '../1794917481157-following-request-id.js';

export class FollowingRequestId1794917481157 extends OriginalFollowingRequestId {
	async up(queryRunner) {
		await queryRunner.query(`LOCK TABLE "following" IN ACCESS EXCLUSIVE MODE NOWAIT`);
		await super.up(queryRunner);
	}
}
