/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { HanaReactionMuteService } from '@/core/HanaReactionMuteService.js';
import type { Packed } from '@/misc/json-schema.js';

/** Oracle: the authenticated page boundary uses freshly read mute relationships. A stale cache cannot restore a muted person's reaction or hide a reaction after unmuting. Reaction rows are authoritative even when the bounded pair cache lacks that person; each muted row reduces its reaction exactly once. */
describe('fresh mute projection for authenticated Hanami pages', () => {
	test.each([
		{ fresh: ['newly-muted'], cached: [] as string[], expected: { '👍': 1 }, count: 1 },
		{ fresh: [] as string[], cached: ['newly-muted'], expected: { '👍': 2 }, count: 2 },
	])('projects the fresh mute set $fresh despite cached relationships $cached', async ({ fresh, cached, expected, count }) => {
		const service = new HanaReactionMuteService(...[
			{ find: async (query: { where: { userId: { value: string[] } } }) => query.where.userId.value.includes('newly-muted') ? [{ noteId: 'note', userId: 'newly-muted', reaction: '👍' }] : [] },
			{ userMutingsCache: { fetch: async () => new Set(cached) } },
			{ convertLegacyReaction: (reaction: string) => reaction },
		] as unknown as ConstructorParameters<typeof HanaReactionMuteService>);
		const note = { id: 'note', reactions: { '👍': 2 }, reactionCount: 2, reactionAndUserPairCache: ['other/👍'] } as unknown as Packed<'Note'>;
		await service.filterMutedReactions([note], 'viewer', false, new Set(fresh));
		expect(note.reactions).toEqual(expected);
		expect(note.reactionCount).toBe(count);
		expect(note).not.toHaveProperty('reactionAndUserPairCache');
	});
});
