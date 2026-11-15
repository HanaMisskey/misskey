/** Oracle: 推薦操作観測契約（2026-11-08）§1。値は合成データであり、eventId は配送上の同一性、noteId は entry との照合用である。 */
export const interactionIdentity = {
	eventId: 'interaction-a', snapshotId: 'snapshot-a', entryId: 'entry-a', noteId: 'note-a',
	occurredAtMs: 1_730_000_000_000, utcOffsetMinutes: 540,
};

export const viewportObservation = () => ({
	...interactionIdentity, kind: 'viewport' as const,
	sequence: 0, elapsedMs: 0, visibleArea: 50, availableArea: 100,
	documentVisible: true, ended: false, focused: true, activityAgeMs: 0, scrollIdleMs: 300,
});

export const detailObservation = () => ({ ...interactionIdentity, kind: 'detail_open' as const });
export const imageObservation = () => ({ ...interactionIdentity, kind: 'image_open' as const, fileId: 'image-a' });
export const replyObservation = () => ({ ...interactionIdentity, kind: 'action' as const, action: 'reply' as const, evidenceNoteId: 'reply-a' });
export const interactionAck = { accepted: 1, duplicates: 0 };
