import { createHash } from 'node:crypto';
import type { MiNote, MiUser } from '@/models/_.js';
import { HanamiPlatformError } from './HanamiPlatformClient.js';

export type HanamiNoteReference = { entryId: string; noteId: string; guard: { contentDigest: string; validUntilMs: number } };
export type HanamiNoteGraph = { note: MiNote & { user: MiUser }; detail: boolean; reply?: HanamiNoteGraph; renote?: HanamiNoteGraph };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

export function validHanamiNoteReference(value: unknown): value is HanamiNoteReference {
	return object(value) && text(value.entryId) && text(value.noteId) && object(value.guard) && typeof value.guard.contentDigest === 'string' && /^[a-f0-9]{64}$/.test(value.guard.contentDigest) && typeof value.guard.validUntilMs === 'number' && Number.isSafeInteger(value.guard.validUntilMs) && value.guard.validUntilMs >= 0;
}

export function hanamiNoteStateDigest(graph: HanamiNoteGraph): string {
	const string = (value: unknown): value is string => typeof value === 'string' && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);
	const nullable = (value: unknown) => value === null || string(value);
	const strings = (value: unknown) => Array.isArray(value) && value.every(string);
	const time = (value: unknown) => value === null || (typeof value === 'number' && Number.isInteger(value) && value >= -2147483648 && value <= 2147483647);
	const state = (item: HanamiNoteGraph): unknown[] => {
		const n = item.note;
		const u = n.user;
		if (![n.id, n.userId, n.visibility, u.id].every(string) ||
			![n.userHost, n.text, n.cw, n.replyId, n.replyUserId, n.renoteId, n.renoteUserId, n.channelId, u.host].every(nullable) ||
			![n.tags, n.emojis, n.fileIds, n.attachedFileTypes, n.visibleUserIds, n.mentions].every(strings) ||
			![n.localOnly, n.hasPoll, n.isNoteInHanaMode, u.isSuspended, u.isDeleted, u.requireSigninToViewContents].every(value => typeof value === 'boolean') ||
			![u.makeNotesHiddenBefore, u.makeNotesFollowersOnlyBefore].every(time)) throw new HanamiPlatformError();
		return [
			'hanami-note-state-v1', item.detail,
			[n.id, n.userId, n.userHost, n.text, n.cw, n.tags, n.emojis, n.fileIds, n.attachedFileTypes, n.visibility, n.visibleUserIds, n.mentions, n.replyId, n.replyUserId, n.renoteId, n.renoteUserId, n.localOnly, n.channelId, n.hasPoll, n.isNoteInHanaMode],
			[u.id, u.host, u.isSuspended, u.isDeleted, u.requireSigninToViewContents, u.makeNotesHiddenBefore, u.makeNotesFollowersOnlyBefore],
			item.reply ? state(item.reply) : null, item.renote ? state(item.renote) : null,
		];
	};
	return createHash('sha256').update(JSON.stringify(state(graph)), 'utf8').digest('hex');
}
