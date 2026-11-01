import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { NotesRepository, UsersRepository, FollowingsRepository, BlockingsRepository, MutingsRepository, RenoteMutingsRepository, UserProfilesRepository, MetasRepository, MiNote, MiUser } from '@/models/_.js';
import type { Packed } from '@/misc/json-schema.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { IdService } from '@/core/IdService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { shouldHideNoteByTime } from '@/misc/should-hide-note-by-time.js';
import { removeMutedUsersReactions } from '@/misc/reactions-mute.js';
import { HanamiPlatformError } from './HanamiPlatformClient.js';
import { hanamiNoteStateDigest, validHanamiNoteReference } from './HanamiNoteReference.js';
import type { HanamiNoteReference, HanamiNoteGraph } from './HanamiNoteReference.js';

export type HanamiSearchOptions = { userId?: string | null; channelId?: string | null; host?: string | null; onlyWithFiles?: boolean };
type AccessRequest = { kind: 'references'; references: ReadonlyMap<string, HanamiNoteReference> } | { kind: 'search'; options: HanamiSearchOptions };
type Access = { following: Set<string>; blocking: Set<string>; blockedBy: Set<string>; muted: Set<string>; renoteMuted: Set<string>; mutedHosts: Set<string>; blockedHosts: string[] };
export type HanamiPackedNote = Packed<'Note'> & { files: Packed<'DriveFile'>[]; reply?: HanamiPackedNote | null; renote?: HanamiPackedNote | null };
type Graph = HanamiNoteGraph;

@Injectable()
export class HanamiNoteAccessService {
	constructor(
		@Inject(DI.notesRepository) private notes: NotesRepository,
		@Inject(DI.usersRepository) private users: UsersRepository,
		@Inject(DI.followingsRepository) private followings: FollowingsRepository,
		@Inject(DI.blockingsRepository) private blockings: BlockingsRepository,
		@Inject(DI.mutingsRepository) private mutings: MutingsRepository,
		@Inject(DI.renoteMutingsRepository) private renoteMutings: RenoteMutingsRepository,
		@Inject(DI.userProfilesRepository) private profiles: UserProfilesRepository,
		@Inject(DI.metasRepository) private metas: MetasRepository,
		private idService: IdService,
		private noteEntityService: NoteEntityService,
		private utilityService: UtilityService,
	) {}

	private async access(me: MiUser): Promise<Access> {
		const [viewer, following, blocking, blockedBy, muted, renoteMuted, profile, meta] = await Promise.all([
			this.users.findOneBy({ id: me.id }), this.followings.findBy({ followerId: me.id }),
			this.blockings.findBy({ blockerId: me.id }), this.blockings.findBy({ blockeeId: me.id }),
			this.mutings.findBy({ muterId: me.id }), this.renoteMutings.findBy({ muterId: me.id }), this.profiles.findOneBy({ userId: me.id }), this.metas.findOneBy({ id: 'x' }),
		]);
		if (me.host != null || !viewer || viewer.host !== null || viewer.isSuspended || viewer.isDeleted || !profile || !meta) throw new HanamiPlatformError();
		return {
			following: new Set(following.map(row => row.followeeId)), blocking: new Set(blocking.map(row => row.blockeeId)),
			blockedBy: new Set(blockedBy.map(row => row.blockerId)), muted: new Set(muted.filter(row => row.expiresAt === null || Number(row.expiresAt) > Date.now()).map(row => row.muteeId)),
			renoteMuted: new Set(renoteMuted.map(row => row.muteeId)), mutedHosts: new Set(profile.mutedInstances), blockedHosts: meta.blockedHosts,
		};
	}

	private async graph(id: string, detail = true, ancestors = new Set<string>(), strict = false, renoteDepth = 0): Promise<Graph | null> {
		if (ancestors.has(id) || renoteDepth > 8) throw new HanamiPlatformError();
		const note = await this.notes.findOneBy({ id });
		if (!note) return null;
		const user = await this.users.findOneBy({ id: note.userId });
		if (!user || user.isDeleted) return null;
		if (user.host !== note.userHost) {
			if (strict) throw new HanamiPlatformError();
			return null;
		}
		if (strict && ((note.replyId === null && note.replyUserId !== null) || (note.renoteId === null && note.renoteUserId !== null))) throw new HanamiPlatformError();
		const graph: Graph = { note: Object.assign(note, { user }), detail };
		if (detail) {
			if (note.replyId) {
				const reply = await this.graph(note.replyId, false, strict ? new Set([...ancestors, id]) : new Set(), strict, renoteDepth);
				if (!reply) return null;
				if (reply.note.userId !== note.replyUserId || reply.note.userHost !== note.replyUserHost) {
					if (strict) throw new HanamiPlatformError();
					return null;
				}
				graph.reply = reply;
				note.reply = reply.note;
			}
			if (note.renoteId) {
				const renote = await this.graph(note.renoteId, true, new Set([...ancestors, id]), strict, renoteDepth + 1);
				if (!renote) return null;
				if (renote.note.userId !== note.renoteUserId || renote.note.userHost !== note.renoteUserHost) {
					if (strict) throw new HanamiPlatformError();
					return null;
				}
				graph.renote = renote;
				note.renote = renote.note;
			}
		}
		return graph;
	}

	private visibility(graph: Graph): MiNote['visibility'] {
		const note = graph.note;
		return (note.visibility === 'public' || note.visibility === 'home') && shouldHideNoteByTime(note.user.makeNotesFollowersOnlyBefore, this.idService.parse(note.id).date) ? 'followers' : note.visibility;
	}

	private visible(graph: Graph, me: MiUser, access: Access): boolean {
		const note = graph.note;
		const visibility = this.visibility(graph);
		if (!['public', 'home', 'followers', 'specified'].includes(visibility)) throw new HanamiPlatformError();
		if (note.userId === me.id) return true;
		if (shouldHideNoteByTime(note.user.makeNotesHiddenBefore, this.idService.parse(note.id).date)) return false;
		if (visibility === 'specified') return note.visibleUserIds.includes(me.id);
		if (visibility === 'followers') return access.following.has(note.userId) || note.mentions.includes(me.id) || graph.reply?.note.userId === me.id;
		return true;
	}

	private hostAllowed(note: MiNote & { user: MiUser }, access: Access): boolean {
		return !this.utilityService.isBlockedHost(access.blockedHosts, note.user.host) && (note.user.host == null || !access.mutedHosts.has(note.user.host));
	}

	private allowed(graph: Graph, me: MiUser, access: Access, request: AccessRequest): boolean {
		const root = graph.note;
		if (request.kind === 'search') {
			const opts = request.options;
			if (opts.onlyWithFiles && root.fileIds.length === 0) return false;
			if (opts.userId && root.userId !== opts.userId) return false;
			if (opts.channelId && root.channelId !== opts.channelId) return false;
			if (opts.host && root.userHost !== (opts.host === '.' ? null : opts.host)) return false;
			const related = [graph, graph.reply, graph.renote, graph.renote?.reply, graph.renote?.renote].filter((item): item is Graph => item != null);
			if (related.some(item => access.blockedBy.has(item.note.userId) || access.muted.has(item.note.userId))) return false;
			if ([graph, graph.reply, graph.renote].some(item => item && (item.note.user.isSuspended || !this.hostAllowed(item.note, access)))) return false;
		}
		const check = (item: Graph): boolean => {
			if (!this.visible(item, me, access)) return false;
			if (request.kind === 'references' && (item.note.user.isSuspended || access.blocking.has(item.note.userId) || access.blockedBy.has(item.note.userId) || access.muted.has(item.note.userId) || !this.hostAllowed(item.note, access))) return false;
			return (!item.reply || check(item.reply)) && (!item.renote || check(item.renote));
		};
		return check(graph);
	}

	private version(graph: Graph): string {
		const note = graph.note;
		return JSON.stringify([
			note.id, note.userId, note.userHost, note.visibility, note.text, note.cw, note.fileIds, note.attachedFileTypes, note.tags, note.mentions, note.visibleUserIds,
			note.replyId, note.renoteId, note.channelId, note.isNoteInHanaMode, note.hasPoll, note.name, note.url, note.uri,
			note.user.isSuspended, note.user.makeNotesHiddenBefore, note.user.makeNotesFollowersOnlyBefore,
			graph.reply ? this.version(graph.reply) : null, graph.renote ? this.version(graph.renote) : null,
		]);
	}

	private async pack(ids: string[], me: MiUser, request: AccessRequest, afterPack?: () => Promise<void>): Promise<HanamiPackedNote[]> {
		const reference = request.kind === 'references';
		const access = await this.access(me);
		const graphs = (await Promise.all([...new Set(ids)].map(id => this.graph(id, true, new Set(), reference)))).filter((graph): graph is Graph => graph != null && this.matches(graph, request) && this.allowed(graph, me, access, request));
		if (graphs.length === 0) {
			await afterPack?.();
			return [];
		}
		const versions = new Map(graphs.map(graph => [graph.note.id, this.version(graph)]));
		// 通常のpackはfollow cacheを使うため、この境界ではfreshな判定を前後に行う。
		const packed = await this.noteEntityService.packMany(graphs.map(graph => graph.note), me, { detail: true, skipHide: true, withReactionAndUserPairCache: true });
		await afterPack?.();
		const current = await this.access(me);
		if (current.renoteMuted.size !== access.renoteMuted.size || [...current.renoteMuted].some(id => !access.renoteMuted.has(id))) throw new HanamiPlatformError('REFRESH_REQUIRED');
		const currentGraphs = await Promise.all(graphs.map(graph => this.graph(graph.note.id, true, new Set(), reference)));
		const allowed = new Set(currentGraphs.filter((graph): graph is Graph => graph != null && this.matches(graph, request) && this.allowed(graph, me, current, request) && this.version(graph) === versions.get(graph.note.id)).map(graph => graph.note.id));
		const hidden = (note: Packed<'Note'>): boolean => !Array.isArray(note.files) || !!note.isHidden || !!(note.reply && hidden(note.reply)) || !!(note.renote && hidden(note.renote));
		const byId = new Map(packed.filter(note => allowed.has(note.id) && !hidden(note)).map(note => [note.id, note]));
		const result = ids.flatMap(id => {
			const note = byId.get(id);
			return note ? [note] : [];
		});
		await Promise.all(result.map(note => removeMutedUsersReactions(note, current.muted)));
		return result as HanamiPackedNote[];
	}

	private matches(graph: Graph, request: AccessRequest): boolean {
		if (request.kind === 'search') return true;
		const reference = request.references.get(graph.note.id);
		return reference != null && Date.now() < reference.guard.validUntilMs && hanamiNoteStateDigest(graph) === reference.guard.contentDigest;
	}

	public packReferences(references: HanamiNoteReference[], me: MiUser, afterPack?: () => Promise<void>): Promise<HanamiPackedNote[]> {
		if (!references.every(validHanamiNoteReference)) throw new HanamiPlatformError();
		return this.pack(references.map(item => item.noteId), me, { kind: 'references', references: new Map(references.map(item => [item.noteId, item])) }, afterPack);
	}

	public packSearchResults(ids: string[], me: MiUser, opts: HanamiSearchOptions): Promise<HanamiPackedNote[]> {
		return this.pack(ids, me, { kind: 'search', options: opts });
	}
}
