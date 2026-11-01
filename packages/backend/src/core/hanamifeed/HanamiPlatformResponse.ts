import { validHanamiNoteReference } from './HanamiNoteReference.js';
import type { HanamiNoteReference } from './HanamiNoteReference.js';
import type { HanamiImpressionsResponse, HanamiPlatformPath, HanamiPlatformResponse, HanamiRecommendationResponse, HanamiSearchResponse } from './HanamiPlatformWire.js';

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const array = (value: unknown): value is unknown[] => Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const nonnegativeInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

function reference(value: unknown): HanamiNoteReference {
	if (!validHanamiNoteReference(value)) throw new Error('Invalid Hanami reference');
	return { entryId: value.entryId, noteId: value.noteId, guard: { contentDigest: value.guard.contentDigest, validUntilMs: value.guard.validUntilMs } };
}

function recommendation(value: Record<string, unknown>): HanamiRecommendationResponse {
	if (value.kind === 'authorize' && text(value.continuation) && array(value.items)) {
		return { kind: 'authorize', continuation: value.continuation, items: value.items.map(reference) };
	}
	const page = value.page;
	if (value.kind !== 'page' || !object(page) || !array(page.items) || !(page.nextCursor === null || text(page.nextCursor)) || !text(page.snapshotId) || !text(page.algorithmVersion) || !nonnegativeInteger(page.revision) || !text(page.validationToken)) throw new Error('Invalid Hanami page');
	return {
		kind: 'page',
		page: { items: page.items.map(reference), nextCursor: page.nextCursor, snapshotId: page.snapshotId, algorithmVersion: page.algorithmVersion, revision: page.revision, validationToken: page.validationToken },
	};
}

function impressions(value: Record<string, unknown>): HanamiImpressionsResponse {
	if (!nonnegativeInteger(value.accepted) || !nonnegativeInteger(value.duplicates)) throw new Error('Invalid Hanami acknowledgement');
	return { accepted: value.accepted, duplicates: value.duplicates };
}

function search(value: Record<string, unknown>): HanamiSearchResponse {
	if (!array(value.hits)) throw new Error('Invalid Hanami search hits');
	const hits = value.hits.map(hit => {
		if (!object(hit) || typeof hit.id !== 'string' || !/^[a-zA-Z0-9]{1,128}$/.test(hit.id)) throw new Error('Invalid Hanami search hit');
		return { id: hit.id };
	});
	if (!('nextCursor' in value)) return { hits };
	if (!(value.nextCursor === null || (text(value.nextCursor) && Buffer.byteLength(JSON.stringify(value.nextCursor)) <= 2048))) throw new Error('Invalid Hanami search cursor');
	return { hits, nextCursor: value.nextCursor };
}

export function decodeHanamiPlatformResponse(path: HanamiPlatformPath, value: unknown): HanamiPlatformResponse {
	if (!object(value)) throw new Error('Invalid Hanami response');
	switch (path) {
		case '/internal/v1/recommendations':
		case '/internal/v1/recommendations/advance':
			return recommendation(value);
		case '/internal/v1/recommendations/validate':
			if (value.valid !== true) throw new Error('Invalid Hanami validation');
			return { valid: true };
		case '/internal/v1/feedback':
			if (!nonnegativeInteger(value.revision) || value.refreshRequired !== true) throw new Error('Invalid Hanami feedback');
			return { revision: value.revision, refreshRequired: true };
		case '/internal/v1/impressions':
			return impressions(value);
		case '/internal/v1/observations':
			if (!array(value.completedEventIds) || !value.completedEventIds.every(text)) throw new Error('Invalid Hanami observations');
			return { ...impressions(value), completedEventIds: [...value.completedEventIds] };
		case '/internal/v1/search':
			return search(value);
	}
}
