import { createHash } from 'node:crypto';
import type { TestRow } from './HanamiRecommendationsFixture.js';

/** Oracle inputs: ADR-0023 fixes a positional JSON array shared with the Python fixture. This helper creates external reference inputs for arbitrary repository rows; the fixed-vector test independently checks the bytes and digest. It performs no authorization or candidate selection. */
export function referenceForRows(noteId: string, notes: TestRow[], users: TestRow[], validUntilMs = Number.MAX_SAFE_INTEGER) {
	const fields = ['id', 'userId', 'userHost', 'text', 'cw', 'tags', 'emojis', 'fileIds', 'attachedFileTypes', 'visibility', 'visibleUserIds', 'mentions', 'replyId', 'replyUserId', 'renoteId', 'renoteUserId', 'localOnly', 'channelId', 'hasPoll', 'isNoteInHanaMode'];
	const authorFields = ['id', 'host', 'isSuspended', 'isDeleted', 'requireSigninToViewContents', 'makeNotesHiddenBefore', 'makeNotesFollowersOnlyBefore'];
	const state = (id: string, detail: boolean, ancestors: Set<string>): unknown => {
		const note = notes.find(row => row.id === id);
		const author = users.find(row => row.id === note?.userId);
		if (!note || !author || ancestors.has(id) || ancestors.size > 8) return null;
		return [
			'hanami-note-state-v1', detail, fields.map(field => note[field]), authorFields.map(field => author[field]),
			detail && note.replyId ? state(String(note.replyId), false, new Set()) : null,
			detail && note.renoteId ? state(String(note.renoteId), true, new Set([...ancestors, id])) : null,
		];
	};
	return { entryId: `entry-${noteId}`, noteId, guard: { contentDigest: createHash('sha256').update(JSON.stringify(state(noteId, true, new Set())), 'utf8').digest('hex'), validUntilMs } };
}
