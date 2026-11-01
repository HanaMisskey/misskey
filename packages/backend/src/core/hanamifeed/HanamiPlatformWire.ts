export type HanamiNoteReference = { entryId: string; noteId: string; guard: { contentDigest: string; validUntilMs: number } };

export type HanamiRecommendationRequest = { limit: number; cursor?: string; refresh?: boolean; imageFilter: 'any' | 'with_image' | 'without_image'; withFiles?: boolean };
export type HanamiFeedbackRequest = { eventId: string; target: { kind: 'author' | 'tag' | 'note'; id: string }; action: 'more' | 'less' | 'reset'; snapshotId: string; entryId: string };
type HanamiEvent = { eventId: string; snapshotId: string; entryId: string };
export type HanamiObservation = HanamiEvent & { sequence: number; elapsedMs: number; visibleArea: number; availableArea: number; documentVisible: boolean; ended: boolean };
export type HanamiImpressionsRequest = { events: HanamiEvent[] } | { version: 2; observations: HanamiObservation[] };
export type HanamiSearchRequest = { q: string; hanamiSearchVersion: 'v2'; sort: string[]; attributesToRetrieve: string[]; filter: string; limit: number; cursor?: string };
export type HanamiRecommendationResponse =
	| { kind: 'authorize'; continuation: string; items: HanamiNoteReference[] }
	| { kind: 'page'; page: { items: HanamiNoteReference[]; nextCursor: string | null; snapshotId: string; algorithmVersion: string; revision: number; validationToken: string } };
export type HanamiImpressionsResponse = { accepted: number; duplicates: number };
export type HanamiSearchResponse = { hits: { id: string }[]; nextCursor?: string | null };

export type HanamiPlatformContract = {
	'/internal/v1/recommendations': { request: HanamiRecommendationRequest; response: HanamiRecommendationResponse };
	'/internal/v1/recommendations/advance': { request: { continuation: string; acceptedNoteIds: string[] }; response: HanamiRecommendationResponse };
	'/internal/v1/recommendations/validate': { request: { validationToken: string }; response: { valid: true } };
	'/internal/v1/feedback': { request: HanamiFeedbackRequest; response: { revision: number; refreshRequired: true } };
	'/internal/v1/impressions': { request: { events: HanamiEvent[] }; response: HanamiImpressionsResponse };
	'/internal/v1/observations': { request: { version: 2; observations: HanamiObservation[] }; response: HanamiImpressionsResponse & { completedEventIds: string[] } };
	'/internal/v1/search': { request: HanamiSearchRequest; response: HanamiSearchResponse };
};
export type HanamiPlatformPath = keyof HanamiPlatformContract;
export type HanamiPlatformRequest = HanamiPlatformContract[HanamiPlatformPath]['request'];
export type HanamiPlatformResponse = HanamiPlatformContract[HanamiPlatformPath]['response'];
