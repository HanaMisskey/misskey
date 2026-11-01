import { Injectable } from '@nestjs/common';
import type { MiUser } from '@/models/_.js';
import type { Packed } from '@/misc/json-schema.js';
import { HanamiPlatformClient, HanamiPlatformError } from './HanamiPlatformClient.js';
import { HanamiNoteAccessService } from './HanamiNoteAccessService.js';
import { validHanamiNoteReference } from './HanamiNoteReference.js';
import type { HanamiNoteReference } from './HanamiNoteReference.js';

export type HanamiRecommendationRequest = { limit: number; cursor?: string; refresh: boolean; imageFilter: 'any' | 'with_image' | 'without_image'; withFiles?: boolean };
export type HanamiFeedbackRequest = { eventId: string; target: { kind: 'author' | 'tag' | 'note'; id: string }; action: 'more' | 'less' | 'reset'; snapshotId: string; entryId: string };
type Event = { eventId: string; snapshotId: string; entryId: string };
export type HanamiObservation = Event & { sequence: number; elapsedMs: number; visibleArea: number; availableArea: number; documentVisible: boolean; ended: boolean };
export type HanamiImpressionsRequest = { events: Event[] } | { version: 2; observations: HanamiObservation[] };
type PageMetadata = { nextCursor: string | null; snapshotId: string; algorithmVersion: string; revision: number };
type Page = PageMetadata & { items: { entryId: string; note: Packed<'Note'> }[] };
type RemotePage = PageMetadata & { items: HanamiNoteReference[]; validationToken: string };
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const nonnegativeInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const references = (value: unknown, limit: number): value is HanamiNoteReference[] => Array.isArray(value) && value.length <= limit && value.every(validHanamiNoteReference) && new Set(value.map(item => item.noteId)).size === value.length && new Set(value.map(item => item.entryId)).size === value.length;
const validPage = (value: unknown, limit: number): value is RemotePage => isObject(value) && references(value.items, limit) && (value.nextCursor === null || text(value.nextCursor)) && text(value.snapshotId) && text(value.algorithmVersion) && nonnegativeInteger(value.revision) && text(value.validationToken);

@Injectable()
export class HanamiRecommendationsService {
	constructor(private client: HanamiPlatformClient, private access: HanamiNoteAccessService) {}

	public async getRecommendations(me: MiUser, input: HanamiRecommendationRequest): Promise<Page> {
		const deadline = Date.now() + 60_000;
		const within = async <T>(operation: () => Promise<T>): Promise<T> => {
			const remaining = deadline - Date.now();
			if (remaining <= 0) throw new HanamiPlatformError();
			let timer: ReturnType<typeof setTimeout> | undefined;
			try {
				const result = await Promise.race([operation(), new Promise<never>((_resolve, reject) => {
					timer = setTimeout(() => reject(new HanamiPlatformError()), remaining);
				})]);
				if (Date.now() >= deadline) throw new HanamiPlatformError();
				return result;
			} finally { clearTimeout(timer); }
		};
		let response = await within(() => this.client.request(me, '/internal/v1/recommendations', input));
		const continuations = new Set<string>();
		while (isObject(response) && response.kind === 'authorize') {
			if (!text(response.continuation) || !references(response.items, input.limit) || continuations.has(response.continuation)) throw new HanamiPlatformError();
			const { continuation, items } = response;
			continuations.add(continuation);
			const packed = await within(() => this.access.packReferences(items, me));
			const accepted = new Set(packed.map(note => note.id));
			const acceptedNoteIds = items.filter(item => accepted.has(item.noteId)).map(item => item.noteId);
			response = await within(() => this.client.request(me, '/internal/v1/recommendations/advance', { continuation, acceptedNoteIds }));
		}
		if (!isObject(response) || response.kind !== 'page' || !validPage(response.page, input.limit) || (input.cursor != null && response.page.nextCursor === input.cursor)) throw new HanamiPlatformError();
		const page = response.page;
		const packed = await within(() => this.access.packReferences(page.items, me, async () => {
			const result = await within(() => this.client.request(me, '/internal/v1/recommendations/validate', { validationToken: page.validationToken }));
			if (!isObject(result) || result.valid !== true) throw new HanamiPlatformError();
		}));
		const notes = new Map(packed.map(note => [note.id, note]));
		return {
			items: page.items.flatMap(item => {
				const note = notes.get(item.noteId);
				return note ? [{ entryId: item.entryId, note }] : [];
			}),
			nextCursor: page.nextCursor, snapshotId: page.snapshotId, algorithmVersion: page.algorithmVersion, revision: page.revision,
		};
	}

	public async submitFeedback(me: MiUser, request: HanamiFeedbackRequest): Promise<{ revision: number; refreshRequired: true }> {
		const result = await this.client.request(me, '/internal/v1/feedback', request);
		if (!isObject(result) || !nonnegativeInteger(result.revision) || result.refreshRequired !== true) throw new HanamiPlatformError();
		return { revision: result.revision, refreshRequired: true };
	}

	public async submitImpressions(me: MiUser, request: HanamiImpressionsRequest): Promise<{ accepted: number; duplicates: number; completedEventIds?: string[] }> {
		const observations = 'observations' in request;
		const records = observations ? request.observations : request.events;
		const result = await this.client.request(me, observations ? '/internal/v1/observations' : '/internal/v1/impressions', request);
		if (!isObject(result) || !nonnegativeInteger(result.accepted) || !nonnegativeInteger(result.duplicates) || result.accepted + result.duplicates !== records.length) throw new HanamiPlatformError();
		if (!observations) return { accepted: result.accepted, duplicates: result.duplicates };
		if (!Array.isArray(result.completedEventIds) || !result.completedEventIds.every(text) || new Set(result.completedEventIds).size !== result.completedEventIds.length || result.completedEventIds.some(id => !records.some(record => record.eventId === id))) throw new HanamiPlatformError();
		return { accepted: result.accepted, duplicates: result.duplicates, completedEventIds: result.completedEventIds };
	}
}
