import type { HanamiClientCapabilities } from './HanamiClientCapabilities.js';
import type { HanamiDeviceContext } from './HanamiDeviceContext.js';

export type HanamiNoteReference = { entryId: string; noteId: string; guard: { contentDigest: string; validUntilMs: number } };

export type HanamiRecommendationRequest = { limit: number; cursor?: string; refresh?: boolean; imageFilter: 'any' | 'with_image' | 'without_image'; withFiles?: boolean; utcOffsetMinutes?: number; deviceContext?: HanamiDeviceContext; clientCapabilities?: HanamiClientCapabilities };
export type HanamiFeedbackRequest = { eventId: string; target: { kind: 'author' | 'tag' | 'note'; id: string }; action: 'more' | 'less' | 'reset'; snapshotId: string; entryId: string };
type HanamiEvent = { eventId: string; snapshotId: string; entryId: string };
export type HanamiObservation = HanamiEvent & { sequence: number; elapsedMs: number; visibleArea: number; availableArea: number; documentVisible: boolean; ended: boolean };
type HanamiWindowMetadata = { windowId?: string; windowSequence?: number; windowElapsedMs?: number };
type HanamiInteractionIdentity = HanamiEvent & HanamiWindowMetadata & { noteId: string; occurredAtMs: number; utcOffsetMinutes: number; deviceContext?: HanamiDeviceContext };
export type HanamiActionObservation = HanamiInteractionIdentity & { kind: 'action' } & (
	| { action: 'reply' | 'quote'; evidenceNoteId: string }
	| { action: 'follow' | 'mute' | 'block' | 'report' }
);
export type HanamiWindowObservation = HanamiInteractionIdentity & Required<HanamiWindowMetadata> & { kind: 'window' } & (
	| { phase: 'open'; displayPosition: number }
	| { phase: 'checkpoint' }
	| { phase: 'close'; recordCount: number; complete: boolean; pendingActions: number; endReason: 'completed' | 'interrupted' | 'pending_action' | 'delivery_failed' | 'budget_exhausted' | 'timer_gap' }
);
export type HanamiInteractionObservation =
	| HanamiInteractionIdentity & HanamiObservation & { kind: 'viewport'; focused: boolean; activityAgeMs: number; scrollIdleMs: number }
	| HanamiInteractionIdentity & { kind: 'detail_open' | 'link_copy' | 'share' }
	| HanamiInteractionIdentity & { kind: 'image_open'; fileId: string }
	| HanamiActionObservation
	| HanamiInteractionIdentity & { kind: 'feedback' }
	| HanamiWindowObservation;
export type HanamiVerifiedInteractionObservation = Exclude<HanamiInteractionObservation, HanamiActionObservation> | HanamiActionObservation & { verified: true; sourceRowId: string };
export type HanamiObservationsRequest = { version: 2; observations: HanamiObservation[] } | { version: 3; observations: HanamiInteractionObservation[] } | { version: 4; observations: HanamiInteractionObservation[] };
export type HanamiImpressionsRequest = { events: HanamiEvent[] } | HanamiObservationsRequest;
export type HanamiSearchRequest = { q: string; hanamiSearchVersion: 'v2'; sort: string[]; attributesToRetrieve: string[]; filter: string; limit: number; cursor?: string };
export type HanamiRecommendationResponse =
	| { kind: 'authorize'; continuation: string; items: HanamiNoteReference[] }
	| { kind: 'page'; page: { items: HanamiNoteReference[]; nextCursor: string | null; snapshotId: string; revision: number; validationToken: string } };
export type HanamiImpressionsResponse = { accepted: number; duplicates: number };
export type HanamiSearchResponse = { hits: { id: string }[]; nextCursor?: string | null };

export type HanamiPlatformContract = {
	'/internal/v1/recommendations': { request: HanamiRecommendationRequest; response: HanamiRecommendationResponse };
	'/internal/v1/recommendations/advance': { request: { continuation: string; acceptedNoteIds: string[] }; response: HanamiRecommendationResponse };
	'/internal/v1/recommendations/validate': { request: { validationToken: string }; response: { valid: true } };
	'/internal/v1/feedback': { request: HanamiFeedbackRequest; response: { revision: number; refreshRequired: true } };
	'/internal/v1/impressions': { request: { events: HanamiEvent[] }; response: HanamiImpressionsResponse };
	'/internal/v1/observations': { request: { version: 4; observations: HanamiVerifiedInteractionObservation[] }; response: HanamiImpressionsResponse };
	'/internal/v1/search': { request: HanamiSearchRequest; response: HanamiSearchResponse };
};
export type HanamiPlatformPath = keyof HanamiPlatformContract;
export type HanamiPlatformRequest = HanamiPlatformContract[HanamiPlatformPath]['request'];
export type HanamiPlatformResponse = HanamiPlatformContract[HanamiPlatformPath]['response'];
