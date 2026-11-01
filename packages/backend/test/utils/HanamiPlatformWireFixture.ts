import type { MiUser } from '@/models/_.js';
import type { HanamiPlatformClient } from '@/core/hanamifeed/HanamiPlatformClient.js';

/** Oracle: Connector ADR-0023 at 9cc24cf1b100aae384ad03cbf80222a034de61b8 defines the seven wire operations. Search uses the existing HanamiSearchV2Service request and internal_api/search.py ID-only response. Values are synthetic opaque tokens and raw observations. */
export const wireRequests = {
	recommendations: { limit: 2, imageFilter: 'any' as const, refresh: false, withFiles: true },
	advance: { continuation: '表示😀', acceptedNoteIds: ['note1'] },
	validate: { validationToken: '表示😀' },
	feedback: { eventId: 'event1', snapshotId: 'snapshot1', entryId: 'entry1', target: { kind: 'note' as const, id: 'note1' }, action: 'less' as const },
	impressions: { events: [{ eventId: 'event1', snapshotId: 'snapshot1', entryId: 'entry1' }] },
	observations: { version: 2 as const, observations: [{ eventId: '表示😀', snapshotId: 'snapshot1', entryId: 'entry1', sequence: 0, elapsedMs: 0, visibleArea: 7, availableArea: 19, documentVisible: true, ended: false }] },
	search: { q: '花', hanamiSearchVersion: 'v2' as const, sort: [], attributesToRetrieve: ['id'], filter: '', limit: 2 },
};

export function wireReference() {
	return { entryId: 'entry1', noteId: 'note1', guard: { contentDigest: 'a'.repeat(64), validUntilMs: 1_900_000_000_000 } };
}

export function wireAuthorize() {
	return { kind: 'authorize' as const, continuation: 'opaque-continuation', items: [wireReference()] };
}

export function wirePage() {
	return { kind: 'page' as const, page: { items: [wireReference()], nextCursor: 'opaque-next', snapshotId: 'snapshot1', algorithmVersion: 'opaque-version', revision: 0, validationToken: 'opaque-validation' } };
}

export function wireOperations(viewer: MiUser) {
	return [
		{ path: '/internal/v1/recommendations', send: (client: HanamiPlatformClient) => client.request(viewer, '/internal/v1/recommendations', wireRequests.recommendations), response: wirePage() },
		{ path: '/internal/v1/recommendations/advance', send: (client: HanamiPlatformClient) => client.request(viewer, '/internal/v1/recommendations/advance', wireRequests.advance), response: wireAuthorize() },
		{ path: '/internal/v1/recommendations/validate', send: (client: HanamiPlatformClient) => client.request(viewer, '/internal/v1/recommendations/validate', wireRequests.validate), response: { valid: true } },
		{ path: '/internal/v1/feedback', send: (client: HanamiPlatformClient) => client.request(viewer, '/internal/v1/feedback', wireRequests.feedback), response: { revision: 0, refreshRequired: true } },
		{ path: '/internal/v1/impressions', send: (client: HanamiPlatformClient) => client.request(viewer, '/internal/v1/impressions', wireRequests.impressions), response: { accepted: 0, duplicates: 1 } },
		{ path: '/internal/v1/observations', send: (client: HanamiPlatformClient) => client.request(viewer, '/internal/v1/observations', wireRequests.observations), response: { accepted: 1, duplicates: 0, completedEventIds: ['表示😀'] } },
		{ path: '/internal/v1/search', send: (client: HanamiPlatformClient) => client.request(viewer, '/internal/v1/search', wireRequests.search), response: { hits: [{ id: 'note1' }], nextCursor: 'opaque-next' } },
	];
}
