import { describe, expect, jest, test } from '@jest/globals';
import type { HanamiRecommendationsService } from '@/core/hanamifeed/HanamiRecommendationsService.js';
import type { MiLocalUser } from '@/models/User.js';
import RecommendationsEndpoint, { meta as recommendationsMeta } from '@/server/api/endpoints/notes/hanami-recommendations.js';
import FeedbackEndpoint, { meta as feedbackMeta } from '@/server/api/endpoints/hanami-feedback.js';
import ImpressionsEndpoint, { meta as impressionsMeta } from '@/server/api/endpoints/hanami-impressions.js';

const viewer = { id: 'alice', host: null } as MiLocalUser;

function fixture() {
	const getRecommendations = jest.fn<(...args: unknown[]) => Promise<unknown>>();
	const submitFeedback = jest.fn<(...args: unknown[]) => Promise<unknown>>();
	const submitImpressions = jest.fn<(...args: unknown[]) => Promise<unknown>>();
	const service = { getRecommendations, submitFeedback, submitImpressions } as unknown as HanamiRecommendationsService;
	return {
		getRecommendations, submitFeedback, submitImpressions,
		recommendations: new RecommendationsEndpoint(service),
		feedback: new FeedbackEndpoint(service),
		impressions: new ImpressionsEndpoint(service),
	};
}

/** Oracle: infra/docs/hanami-timeline-v0.1-design.md §6 assigns viewer identity to Misskey and preserves existing timeline policy. These unit tests exercise endpoint validation; HTTP authentication is tested separately. */
describe('Hanami recommendation API boundary', () => {
	test.each([
		['recommendations', recommendationsMeta],
		['feedback', feedbackMeta],
		['impressions', impressionsMeta],
	])('%s requires credentials and the existing Hanami timeline policy', (_name, meta) => {
		expect(meta.requireCredential).toBe(true);
		expect(meta.requiredRolePolicy).toBe('hanamiTlAvailable');
	});

	test('recommendations accept account-read tokens', () => {
		expect(recommendationsMeta.kind).toBe('read:account');
	});

	/** Oracle: the public page contract lists the complete response shape. The endpoint schema is the input to OpenAPI and generated SDK types, so undeclared internal fields must not be declared here either. */
	test('declares only public page and entry fields in the generated API schema', () => {
		expect(Object.keys(recommendationsMeta.res.properties).sort()).toEqual(['algorithmVersion', 'items', 'nextCursor', 'revision', 'snapshotId']);
		expect(Object.keys(recommendationsMeta.res.properties.items.items.properties).sort()).toEqual(['entryId', 'note']);
	});

	test('passes the authenticated local viewer and only declared retrieval conditions', async () => {
		const f = fixture();
		const page = {
			items: [{ entryId: 'entry-a', note: { id: 'note-a' } }],
			nextCursor: 'next', snapshotId: 'snapshot-a', algorithmVersion: 'local-v0.1.0', revision: 0,
		};
		f.getRecommendations.mockResolvedValue(page);
		await expect(f.recommendations.exec({ limit: 3, cursor: 'current', imageFilter: 'with_image', i: 'synthetic-browser-token' }, viewer, null)).resolves.toEqual(page);
		expect(f.getRecommendations).toHaveBeenCalledWith(viewer, {
			limit: 3, cursor: 'current', imageFilter: 'with_image', refresh: false, withFiles: false,
		});
	});

	test('uses the initial page defaults without a browser-selected identity', async () => {
		const f = fixture();
		f.getRecommendations.mockResolvedValue({ items: [], nextCursor: null });
		await f.recommendations.exec({}, viewer, null);
		expect(f.getRecommendations).toHaveBeenCalledWith(viewer, expect.objectContaining({ limit: 20, imageFilter: 'any', refresh: false, withFiles: false }));
		expect(f.getRecommendations.mock.calls[0][1]).not.toHaveProperty('viewerId');
	});

	/** Oracle: the public file switch defaults to false, accepts only booleans, and intersects the retained imageFilter API. The endpoint must convey both conditions to the service. */
	test.each([true, false])('forwards withFiles=%s together with the legacy image condition', async withFiles => {
		const f = fixture();
		f.getRecommendations.mockResolvedValue({ items: [], nextCursor: null });
		await f.recommendations.exec({ withFiles, imageFilter: 'without_image' }, viewer, null);
		expect(f.getRecommendations).toHaveBeenCalledWith(viewer, expect.objectContaining({ withFiles, imageFilter: 'without_image' }));
	});

	test.each([
		{ viewerId: 'bob' },
		{ viewerId: 'alice' },
		{ limit: 0 },
		{ limit: 101 },
		{ limit: 1.5 },
		{ cursor: '' },
		{ cursor: 42 },
		{ cursor: 'x'.repeat(4097) },
		{ cursor: 'current', refresh: true },
		{ imageFilter: 'video' },
		{ withFiles: 'true' },
		{ withFiles: 1 },
		{ withFiles: null },
	])('rejects invalid recommendation input %p before calling the service', async params => {
		const f = fixture();
		await expect(f.recommendations.exec(params, viewer, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		expect(f.getRecommendations).not.toHaveBeenCalled();
	});

	/** Oracle: explicit choices are durable service operations keyed by the authenticated viewer; more/less/reset are the agreed actions, and less is not account blocking. */
	test.each(['more', 'less', 'reset'] as const)('relays %s for the authenticated viewer and preserves the resulting revision', async action => {
		const f = fixture();
		const params = { eventId: 'feedback-event-a', target: { kind: 'author', id: 'bob' }, action, snapshotId: 'snapshot-a', entryId: 'entry-a' };
		f.submitFeedback.mockResolvedValue({ revision: 7, refreshRequired: true });
		await expect(f.feedback.exec(params, viewer, null)).resolves.toEqual({ revision: 7, refreshRequired: true });
		expect(f.submitFeedback).toHaveBeenCalledWith(viewer, params);
	});

	test.each([
		{ viewerId: 'bob' },
		{ action: 'hide' },
		{ target: { kind: 'instance', id: 'example.test' } },
		{ eventId: '' },
		{ snapshotId: '' },
		{ entryId: '' },
	])('rejects invalid feedback input %p before calling the service', async invalid => {
		const f = fixture();
		const params = { eventId: 'feedback-event-a', target: { kind: 'note', id: 'note-a' }, action: 'less', snapshotId: 'snapshot-a', entryId: 'entry-a', ...invalid };
		await expect(f.feedback.exec(params, viewer, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		expect(f.submitFeedback).not.toHaveBeenCalled();
	});

	/** Oracle: §6 separates actual display events from API delivery, and requires snapshot/entry verification plus stable IDs for retry. */
	test('relays display IDs unchanged and assigns the authenticated viewer', async () => {
		const f = fixture();
		const params = { events: [{ eventId: 'impression-a', snapshotId: 'snapshot-a', entryId: 'entry-a' }] };
		f.submitImpressions.mockResolvedValue({ accepted: 1, duplicates: 0 });
		await expect(f.impressions.exec(params, viewer, null)).resolves.toEqual({ accepted: 1, duplicates: 0 });
		expect(f.submitImpressions).toHaveBeenCalledWith(viewer, params);
	});

	test.each([
		{ viewerId: 'bob', events: [{ eventId: 'event-a', snapshotId: 'snapshot-a', entryId: 'entry-a' }] },
		{ events: [{ eventId: 'event-a', snapshotId: 'snapshot-a', entryId: 'entry-a', viewerId: 'bob' }] },
		{ events: [{ eventId: 'event-a', snapshotId: 'snapshot-a' }] },
		{ events: [{ eventId: '', snapshotId: 'snapshot-a', entryId: 'entry-a' }] },
		{ events: [] },
		{ events: Array.from({ length: 101 }, (_, i) => ({ eventId: `event-${i}`, snapshotId: 'snapshot-a', entryId: 'entry-a' })) },
	])('rejects invalid display event input %p before calling the service', async params => {
		const f = fixture();
		await expect(f.impressions.exec(params, viewer, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		expect(f.submitImpressions).not.toHaveBeenCalled();
	});

	/** Oracle: the public observation API transports geometry, ordered relative time, tab state and terminal state. It does not convert measurements into display events. */
	test('accepts version two observation records without changing measurements or identity', async () => {
		const f = fixture();
		const params = { version: 2, observations: [{ eventId: 'series', snapshotId: 'snapshot', entryId: 'entry', sequence: 0, elapsedMs: 0, visibleArea: 49, availableArea: 100, documentVisible: true, ended: false }] };
		f.submitImpressions.mockResolvedValue({ accepted: 1, duplicates: 0, completedEventIds: [] });
		await expect(f.impressions.exec(params, viewer, null)).resolves.toEqual({ accepted: 1, duplicates: 0, completedEventIds: [] });
		expect(f.submitImpressions).toHaveBeenCalledWith(viewer, params);
		expect(Object.keys(impressionsMeta.res.properties).sort()).toEqual(['accepted', 'completedEventIds', 'duplicates']);
	});

	test.each([
		{ version: 1 }, { version: '2' }, { observations: [] },
		{ events: [{ eventId: 'e', snapshotId: 's', entryId: 'i' }] },
	])('rejects an ambiguous or invalid observation envelope %p', async invalid => {
		const f = fixture();
		const params = { version: 2, observations: [{ eventId: 'e', snapshotId: 's', entryId: 'i', sequence: 0, elapsedMs: 0, visibleArea: 0, availableArea: 100, documentVisible: true, ended: false }], ...invalid };
		await expect(f.impressions.exec(params, viewer, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		expect(f.submitImpressions).not.toHaveBeenCalled();
	});

	test.each([
		{ sequence: -1 }, { sequence: 0.5 }, { elapsedMs: -1 }, { elapsedMs: 1.5 },
		{ visibleArea: -1 }, { availableArea: '100' }, { documentVisible: 1 }, { ended: null }, { viewerId: 'bob' },
	])('rejects invalid raw observation fields %p before forwarding', async invalid => {
		const f = fixture();
		const observation = { eventId: 'e', snapshotId: 's', entryId: 'i', sequence: 0, elapsedMs: 0, visibleArea: 0, availableArea: 100, documentVisible: true, ended: false, ...invalid };
		await expect(f.impressions.exec({ version: 2, observations: [observation] }, viewer, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		expect(f.submitImpressions).not.toHaveBeenCalled();
	});

	/** Oracle: recommendation unavailability must be observable and must not disclose internal hosts, credentials or error bodies. */
	test('maps an internal failure to an explicit unavailable response without private details', async () => {
		const f = fixture();
		f.getRecommendations.mockRejectedValue(new Error('private-detail-marker'));
		const error = await f.recommendations.exec({}, viewer, null).catch((cause: unknown) => cause);
		expect(error).toMatchObject({ code: 'UNAVAILABLE', httpStatusCode: 503 });
		expect(String(error)).not.toContain('private-detail-marker');
		expect(JSON.stringify(error)).not.toContain('private-detail-marker');
	});
});
