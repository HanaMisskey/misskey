/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, toValue } from 'vue';
import type { MaybeRefOrGetter } from 'vue';
import type * as Misskey from 'misskey-js';
import { getEmojiMuteKey, isMuted } from '@/utility/emoji-mute.js';
import { misskeyApi } from '@/utility/misskey-api.js';

export type ReactionGroup = {
	reaction: string;
	sources: string[];
	count: number;
};

export function groupReactions(reactions: Record<string, number>): ReactionGroup[] {
	const groups = new Map<string, ReactionGroup>();
	for (const [source, count] of Object.entries(reactions)) {
		if (count === 0) continue;
		const reaction = isMuted(source) || getEmojiMuteKey(source) === '❤' ? '❤' : source;
		// 比較用のVS16除去を検索値にも適用すると、DB上の元リアクションに一致しなくなる。
		const group = groups.get(reaction);
		if (group) {
			group.sources.push(source);
			group.count += count;
		} else {
			groups.set(reaction, { reaction, sources: [source], count });
		}
	}
	return [...groups.values()];
}

export function includesReaction(sources: string[], reaction: string | null | undefined): boolean {
	return reaction != null && sources.some(source => getEmojiMuteKey(source) === getEmojiMuteKey(reaction));
}

export function useHanaReactionGroups(
	reactions: MaybeRefOrGetter<Record<string, number>>,
	myReaction: MaybeRefOrGetter<string | null | undefined>,
) {
	const groups = computed(() => groupReactions(toValue(reactions)));
	const groupsByReaction = computed(() => new Map(groups.value.map(group => [group.reaction, group])));
	return {
		reactions: computed(() => Object.fromEntries(groups.value.map(group => [group.reaction, group.count]))),
		myReaction: computed(() => groups.value.find(group => includesReaction(group.sources, toValue(myReaction)))?.reaction),
		sourcesFor: (reaction: string) => groupsByReaction.value.get(reaction)?.sources ?? [],
	};
}

export async function fetchReactionGroup(params: Misskey.Endpoints['notes/reactions']['req']): Promise<Misskey.entities.NoteReaction[]> {
	const { types, ...query } = params;
	if (!types || types.length <= 1000) return misskeyApi('notes/reactions', params);

	const chunks: string[][] = [];
	for (let i = 0; i < types.length; i += 1000) chunks.push(types.slice(i, i + 1000));
	const reactions = new Map<string, Misskey.entities.NoteReaction>();
	let nextChunk = 0;
	await Promise.all(Array.from({ length: Math.min(4, chunks.length) }, async () => {
		while (nextChunk < chunks.length) {
			const chunk = chunks[nextChunk++];
			const rows = await misskeyApi('notes/reactions', { ...query, types: chunk });
			for (const row of rows) reactions.set(row.id, row);
		}
	}));
	return [...reactions.values()].sort((a, b) => a.id < b.id ? 1 : a.id > b.id ? -1 : 0).slice(0, params.limit ?? 10);
}
