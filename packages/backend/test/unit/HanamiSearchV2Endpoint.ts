/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, jest, test } from '@jest/globals';
import Endpoint, { meta } from '@/server/api/endpoints/notes/hanamisearch-v2.js';
import { DEFAULT_POLICIES } from '@/core/RoleService.js';
import type { HanamiSearchV2Service } from '@/core/hanamisearch/HanamiSearchV2Service.js';
import type { MiLocalUser } from '@/models/User.js';

const viewer = { id: 'viewer' } as MiLocalUser;

/** Oracle: HanamiSearch v2 is separately granted and returns notes with an optional continuation. */
describe('HanamiSearch v2 API', () => {
	/** Oracle: a search governed by an individual role must reject missing credentials before evaluating that role. */
	test('requires credentials before checking the search permission', () => {
		expect(meta.requireCredential).toBe(true);
	});

	/** Oracle: account-read tokens may perform this read-only search after role authorization. */
	test('accepts the existing account-read permission for API tokens', () => {
		expect(meta).toHaveProperty('kind', 'read:account');
	});
	test('requires its own permission, disabled by default', () => {
		expect(meta.requiredRolePolicy).toBe('canSearchWithHanamiSearchV2');
		expect(DEFAULT_POLICIES.canSearchWithHanamiSearchV2).toBe(false);
		expect(DEFAULT_POLICIES.canSearchWithHanamiSearchV1).toBe(true);
	});

	test('passes all search conditions and returns the continuation', async () => {
		const page = { notes: [], nextCursor: 'next-page' };
		const searchNote = jest.fn<HanamiSearchV2Service['searchNote']>().mockResolvedValue(page);
		const endpoint = new Endpoint({ searchNote } as unknown as HanamiSearchV2Service);
		const params = { query: '花', host: '.', userId: 'user1', channelId: 'channel1', onlyWithFiles: true, limit: 3, cursor: 'previous-page' };
		expect(await endpoint.exec(params, viewer, null)).toEqual(page);
		expect(searchNote).toHaveBeenCalledWith('花', viewer, {
			host: '.', userId: 'user1', channelId: 'channel1', onlyWithFiles: true,
		}, { limit: 3, cursor: 'previous-page' });
	});

	test.each([{ limit: 0 }, { limit: 101 }, { limit: 1.5 }, { cursor: 42 }, { onlyWithFiles: 'yes' }])('rejects invalid input %p before searching', async (invalid) => {
		const searchNote = jest.fn<HanamiSearchV2Service['searchNote']>();
		const endpoint = new Endpoint({ searchNote } as unknown as HanamiSearchV2Service);
		await expect(endpoint.exec({ query: '花', ...invalid }, viewer, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		expect(searchNote).not.toHaveBeenCalled();
	});

	/** Oracle: an unavailable search must not expose failure details to API clients. */
	test('returns a stable error without private failure details', async () => {
		const searchNote = jest.fn<HanamiSearchV2Service['searchNote']>().mockRejectedValue(new Error('private-detail-marker'));
		const endpoint = new Endpoint({ searchNote } as unknown as HanamiSearchV2Service);
		try {
			await endpoint.exec({ query: '花' }, viewer, null);
			throw new Error('Expected failure');
		} catch (error) {
			expect(error).toMatchObject({ code: 'UNAVAILABLE' });
			expect(JSON.stringify(error)).not.toContain('private-detail-marker');
			expect(String(error)).not.toContain('private-detail-marker');
		}
	});
});
