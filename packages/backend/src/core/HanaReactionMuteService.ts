import { Inject, Injectable } from '@nestjs/common';
import { Any } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiUser, NoteReactionsRepository } from '@/models/_.js';
import { bindThis } from '@/decorators.js';
import { CacheService } from '@/core/CacheService.js';
import { ReactionService } from '@/core/ReactionService.js';
import { removeMutedUsersReactions } from '@/misc/reactions-mute.js';

@Injectable()
export class HanaReactionMuteService {
	private projectedMyReactions = new WeakMap<object, { userId: MiUser['id']; reaction: string | null }>();

	constructor(
		@Inject(DI.noteReactionsRepository)
		private noteReactionsRepository: NoteReactionsRepository,
		private cacheService: CacheService,
		private reactionService: ReactionService,
	) {}

	@bindThis
	public getMyReaction(note: object, meId: MiUser['id']) {
		const projected = this.projectedMyReactions.get(note);
		return projected?.userId === meId ? projected : undefined;
	}

	@bindThis
	public async fetchMutedReactions(noteIds: string[], meId: MiUser['id'] | null, myReactions?: Map<string, string | null>): Promise<Map<string, string[]>> {
		const result = new Map<string, string[]>();
		if (meId == null || noteIds.length === 0) return result;
		const mutedUserIds = await this.cacheService.userMutingsCache.fetch(meId);
		if (mutedUserIds.size === 0) return result;
		if (myReactions) {
			for (const noteId of noteIds) myReactions.set(noteId, null);
		}

		// The pair cache is bounded and may still contain a buffered cancellation.
		const reactions = await this.noteReactionsRepository.find({
			where: { noteId: Any(noteIds), userId: Any(myReactions ? [...mutedUserIds, meId] : [...mutedUserIds]) },
			select: { noteId: true, userId: true, reaction: true },
		});
		for (const { noteId, userId, reaction } of reactions) {
			if (myReactions && userId === meId) {
				myReactions.set(noteId, reaction);
				continue;
			}
			const muted = result.get(noteId) ?? [];
			muted.push(this.reactionService.convertLegacyReaction(reaction));
			result.set(noteId, muted);
		}
		return result;
	}

	@bindThis
	public async filterMutedReactions(notes: Packed<'Note'>[], meId: MiUser['id'] | null, withReactionAndUserPairCache = false): Promise<void> {
		if (meId == null) return;
		const targets = new Set<Packed<'Note'>>();
		const collect = (note: Packed<'Note'>) => {
			if (targets.has(note)) return;
			targets.add(note);
			if (note.renote) collect(note.renote);
			if (note.reply) collect(note.reply);
		};
		for (const note of notes) collect(note);
		const noteIds = [...new Set([...targets].filter(note => Object.keys(note.reactions).length > 0).map(note => note.id))];
		const myReactions = new Map<string, string | null>();
		const mutedReactions = await this.fetchMutedReactions(noteIds, meId, myReactions);
		for (const note of targets) {
			const muted = mutedReactions.get(note.id) ?? [];
			const hasMutedReactions = muted.some(reaction => (note.reactions[reaction] ?? 0) > 0);
			note.reactions = removeMutedUsersReactions(note.reactions, muted);
			note.reactionCount = Object.values(note.reactions).reduce((total, count) => total + count, 0);
			if (myReactions.has(note.id)) {
				const reaction = myReactions.get(note.id)!;
				// Stream channels must not infer the viewer's reaction from a reduced count or a cancelled pair.
				this.projectedMyReactions.set(note, { userId: meId, reaction });
				if (withReactionAndUserPairCache || Object.hasOwn(note, 'myReaction')) {
					note.myReaction = reaction ? this.reactionService.convertLegacyReaction(reaction) : undefined;
				}
			}
			// A reduced count cannot prove that the bounded pair cache includes the viewer.
			if (!withReactionAndUserPairCache || hasMutedReactions) delete note.reactionAndUserPairCache;
		}
	}
}
