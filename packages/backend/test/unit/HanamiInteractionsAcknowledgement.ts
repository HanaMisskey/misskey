import { describe, expect, jest, test } from '@jest/globals';
import type { MiUser } from '@/models/_.js';
import { HanamiRecommendationsService } from '@/core/hanamifeed/HanamiRecommendationsService.js';
import type { HanamiImpressionsRequest } from '@/core/hanamifeed/HanamiPlatformWire.js';
import { detailObservation, imageObservation, interactionAck, viewportObservation } from '../utils/HanamiInteractionsFixture.js';

const viewer = { id: 'alice', host: null } as MiUser;

function fixture() {
	const request = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(interactionAck);
	const service = new HanamiRecommendationsService(...[{ request }, {}] as unknown as ConstructorParameters<typeof HanamiRecommendationsService>);
	return { request, service };
}

const payload = (observations: unknown[]): HanamiImpressionsRequest => ({ version: 4, observations } as unknown as HanamiImpressionsRequest);

/** Oracle: the v4 receipt contract returns only nonnegative integer counts covering the entire batch. Unknown fields must not affect receipt acceptance or escape to the caller. */
describe('Hanami interaction receipt acknowledgement', () => {
	test.each([detailObservation(), imageObservation(), viewportObservation()])('projects receipt counts for $kind independently of extra metadata', async observation => {
		const f = fixture();
		const input = payload([observation]);
		f.request.mockResolvedValue({ ...interactionAck, extraFlag: true, extraIds: ['synthetic-id'], extraString: 'synthetic-value' });
		await expect(f.service.submitImpressions(viewer, input)).resolves.toEqual(interactionAck);
		expect(f.request).toHaveBeenCalledWith(viewer, '/internal/v1/observations', input);
	});

	test('accepts a receipt containing only duplicate counts', async () => {
		const f = fixture();
		const ack = { accepted: 0, duplicates: 1 };
		f.request.mockResolvedValue(ack);
		await expect(f.service.submitImpressions(viewer, payload([imageObservation()]))).resolves.toEqual(ack);
	});

	test('accounts for both viewport and independent image records in one receipt', async () => {
		const f = fixture();
		const observations = [viewportObservation(), { ...imageObservation(), eventId: 'image-open-a' }];
		const ack = { accepted: 1, duplicates: 1 };
		f.request.mockResolvedValue(ack);
		await expect(f.service.submitImpressions(viewer, payload(observations))).resolves.toEqual(ack);
	});

	test.each([
		{ accepted: 0, duplicates: 0 }, { accepted: 2, duplicates: 0 },
		{ accepted: -1, duplicates: 2 }, { accepted: 0.5, duplicates: 0.5 },
		{ accepted: 1 }, { accepted: 1, duplicates: '0' },
	])('rejects an inconsistent receipt %p', async ack => {
		const f = fixture();
		f.request.mockResolvedValue(ack);
		await expect(f.service.submitImpressions(viewer, payload([viewportObservation()]))).rejects.toMatchObject({ code: 'UNAVAILABLE' });
	});

	/** Oracle: v2/v3 migration failure precedes signature requests even when the service is called without the public endpoint. */
	test.each([2, 3])('requires refresh for version %i before requesting a signed observation', async version => {
		const f = fixture();
		const observation = version === 2
			? { eventId: 'old-series', snapshotId: 'snapshot-a', entryId: 'entry-a', sequence: 0, elapsedMs: 0, visibleArea: 7, availableArea: 19, documentVisible: true, ended: false }
			: viewportObservation();
		const input = { version, observations: [observation] } as unknown as HanamiImpressionsRequest;
		await expect(f.service.submitImpressions(viewer, input)).rejects.toMatchObject({ code: 'REFRESH_REQUIRED' });
		expect(f.request).not.toHaveBeenCalled();
	});
});
