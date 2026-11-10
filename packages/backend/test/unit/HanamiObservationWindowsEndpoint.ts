import { describe, expect, jest, test } from '@jest/globals';
import type { HanamiRecommendationsService } from '@/core/hanamifeed/HanamiRecommendationsService.js';
import type { MiLocalUser } from '@/models/User.js';
import ImpressionsEndpoint from '@/server/api/endpoints/hanami-impressions.js';
import RecommendationsEndpoint from '@/server/api/endpoints/notes/hanami-recommendations.js';
import { interactionIdentity, viewportObservation } from '../utils/HanamiInteractionsFixture.js';

const viewer = { id: 'alice', host: null } as MiLocalUser;
const metadata = { windowId: 'window-a', windowSequence: 1, windowElapsedMs: 0 };
const open = { ...interactionIdentity, kind: 'window', eventId: 'window-a', ...metadata, windowSequence: 0, phase: 'open', displayPosition: 1 };
const checkpoint = { ...open, phase: 'checkpoint', windowSequence: 2, windowElapsedMs: 1000 };
delete (checkpoint as Partial<typeof checkpoint>).displayPosition;
const close = { ...checkpoint, phase: 'close', windowSequence: 64, windowElapsedMs: 60_000, recordCount: 65, complete: true, pendingActions: 0, endReason: 'completed' };
const feedback = { ...interactionIdentity, kind: 'feedback', eventId: 'saved-feedback', ...metadata };

function fixture() {
	const submitImpressions = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockImplementation(async (_me, input) => {
		const request = input as { observations: unknown[] };
		return { accepted: request.observations.length, duplicates: 0 };
	});
	const getRecommendations = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({ items: [], nextCursor: null, snapshotId: 'snapshot-a', revision: 0 });
	const service = { submitImpressions, getRecommendations } as unknown as HanamiRecommendationsService;
	return { submitImpressions, getRecommendations, endpoint: new ImpressionsEndpoint(service), recommendations: new RecommendationsEndpoint(service) };
}

/** Oracle: contract §6 and addendum §§4/8 permit the listed v4 window and action fields, reject additional properties, and require an empty response after successful delivery. */
describe('Hanami observation-window public schema', () => {
	test.each([open, checkpoint, close, feedback, { ...viewportObservation(), ...metadata }, { ...interactionIdentity, kind: 'detail_open', ...metadata }])('accepts collection metadata for $kind/$phase without returning the internal receipt', async record => {
		const f = fixture();
		const body = { version: 4, observations: [record] };
		await expect(f.endpoint.exec({ ...body, i: 'browser-credential' }, viewer, null)).resolves.toBeUndefined();
		expect(f.submitImpressions).toHaveBeenCalledWith(viewer, body);
	});

	test('accepts an older v4 viewport without inventing window metadata', async () => {
		const f = fixture();
		const body = { version: 4, observations: [viewportObservation()] };
		await expect(f.endpoint.exec(body, viewer, null)).resolves.toBeUndefined();
		expect(f.submitImpressions).toHaveBeenCalledWith(viewer, body);
	});

	test.each([
		{ ...open, displayPosition: 0 }, { ...open, displayPosition: 10_001 },
		{ ...open, windowId: '' }, { ...open, windowId: 'x'.repeat(129) },
		{ ...open, windowSequence: -1 }, { ...open, windowSequence: 0.5 },
		{ ...open, windowElapsedMs: -1 }, { ...open, windowElapsedMs: 60_001 },
		{ ...open, phase: 'unknown' }, { ...open, extraFlag: true },
		{ ...checkpoint, displayPosition: 1 },
		{ ...close, recordCount: 1 }, { ...close, recordCount: 401 },
		{ ...close, complete: 'true' }, { ...close, pendingActions: -1 },
		{ ...close, pendingActions: 401 }, { ...close, endReason: 'unknown' },
		{ ...feedback, target: { kind: 'author', id: 'author-a' } },
		{ ...feedback, action: 'less' }, { ...feedback, verified: true },
		{ ...feedback, sourceRowId: 'fabricated' }, { ...feedback, feedbackEventId: 'fabricated' },
		{ ...feedback, evidenceNoteId: 'private-created-note' },
	])('rejects an invalid record without forwarding its valid neighbor: %p', async invalid => {
		const f = fixture();
		await expect(f.endpoint.exec({ version: 4, observations: [viewportObservation(), invalid] }, viewer, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		expect(f.submitImpressions).not.toHaveBeenCalled();
	});

	test.each(['windowId', 'windowSequence', 'windowElapsedMs'])('rejects a partial metadata triple missing %s', async missing => {
		const f = fixture();
		const record: Record<string, unknown> = { ...viewportObservation(), ...metadata };
		delete record[missing];
		await expect(f.endpoint.exec({ version: 4, observations: [record] }, viewer, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		expect(f.submitImpressions).not.toHaveBeenCalled();
	});

	test.each([true, false, undefined])('forwards nativeShare=%s without treating omission as false', async nativeShare => {
		const f = fixture();
		const ability = nativeShare === undefined ? {} : { clientCapabilities: { nativeShare } };
		await f.recommendations.exec({ limit: 20, ...ability }, viewer, null);
		const input = f.getRecommendations.mock.calls[0][1];
		if (nativeShare === undefined) expect(input).not.toHaveProperty('clientCapabilities');
		else expect(input).toMatchObject(ability);
	});

	test.each([null, {}, [], true, { nativeShare: 1 }, { nativeShare: 'true' }, { nativeShare: null }, { nativeShare: false, extraString: 'synthetic-value' }])('rejects invalid client capabilities %p', async clientCapabilities => {
		const f = fixture();
		await expect(f.recommendations.exec({ clientCapabilities }, viewer, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		expect(f.getRecommendations).not.toHaveBeenCalled();
	});
});
