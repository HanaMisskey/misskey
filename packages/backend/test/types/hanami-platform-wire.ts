import type { MiUser } from '@/models/_.js';
import type { HanamiPlatformClient } from '@/core/hanamifeed/HanamiPlatformClient.js';
import { wireRequests } from '../utils/HanamiPlatformWireFixture.js';

type Same<Actual, Expected> = 0 extends (1 & Actual) ? false : [Actual] extends [Expected] ? [Expected] extends [Actual] ? true : false : false;
type Reference = { entryId: string; noteId: string; guard: { contentDigest: string; validUntilMs: number } };
type Recommendation = { kind: 'authorize'; continuation: string; items: Reference[] } | { kind: 'page'; page: {
	items: Reference[]; nextCursor: string | null; snapshotId: string; algorithmVersion: string; revision: number; validationToken: string;
} };

/** Oracle: Connector ADR-0023 at 9cc24cf1b100aae384ad03cbf80222a034de61b8 exposes only wire fields and opaque strings. Each signed path determines both its input and its decoded output; no caller chooses a response type. This fixture is compiled by backend typecheck. */
export async function inferredWireResponses(client: HanamiPlatformClient, viewer: MiUser) {
	const recommendation = await client.request(viewer, '/internal/v1/recommendations', wireRequests.recommendations);
	const advance = await client.request(viewer, '/internal/v1/recommendations/advance', wireRequests.advance);
	const validate = await client.request(viewer, '/internal/v1/recommendations/validate', wireRequests.validate);
	const feedback = await client.request(viewer, '/internal/v1/feedback', wireRequests.feedback);
	const impressions = await client.request(viewer, '/internal/v1/impressions', wireRequests.impressions);
	const observations = await client.request(viewer, '/internal/v1/observations', wireRequests.observations);
	const search = await client.request(viewer, '/internal/v1/search', wireRequests.search);
	const responseTypes: [
		Same<typeof recommendation, Recommendation>, Same<typeof advance, Recommendation>,
		Same<typeof validate, { valid: true }>, Same<typeof feedback, { revision: number; refreshRequired: true }>,
		Same<typeof impressions, { accepted: number; duplicates: number }>,
		Same<typeof observations, { accepted: number; duplicates: number; completedEventIds: string[] }>,
		Same<typeof search, { hits: { id: string }[]; nextCursor?: string | null }>,
	] = [true, true, true, true, true, true, true];
	if (recommendation.kind === 'authorize') {
		const authorizationKeys: Same<keyof typeof recommendation, 'kind' | 'continuation' | 'items'> = true;
		const continuation: Same<typeof recommendation.continuation, string> = true;
		void [authorizationKeys, continuation];
	} else {
		const pageKeys: Same<keyof typeof recommendation.page, 'items' | 'nextCursor' | 'snapshotId' | 'algorithmVersion' | 'revision' | 'validationToken'> = true;
		const referenceKeys: Same<keyof typeof recommendation.page.items[number], 'entryId' | 'noteId' | 'guard'> = true;
		const guardKeys: Same<keyof typeof recommendation.page.items[number]['guard'], 'contentDigest' | 'validUntilMs'> = true;
		const opaqueVersion: Same<typeof recommendation.page.algorithmVersion, string> = true;
		const opaqueValidation: Same<typeof recommendation.page.validationToken, string> = true;
		void [pageKeys, referenceKeys, guardKeys, opaqueVersion, opaqueValidation];
	}
	const searchHitKeys: Same<keyof typeof search.hits[number], 'id'> = true;
	const ackKeys: [
		Same<keyof typeof validate, 'valid'>, Same<keyof typeof feedback, 'revision' | 'refreshRequired'>,
		Same<keyof typeof impressions, 'accepted' | 'duplicates'>,
		Same<keyof typeof observations, 'accepted' | 'duplicates' | 'completedEventIds'>,
		Same<keyof typeof search, 'hits' | 'nextCursor'>,
	] = [true, true, true, true, true];
	void [responseTypes, searchHitKeys, ackKeys];
	// @ts-expect-error Wire responses do not expose arbitrary extra fields.
	void feedback.privateMarker;
	// @ts-expect-error Legacy ACK has no completed observation series.
	void impressions.completedEventIds;
}

/** Oracle: the existing seven signed DTOs are not interchangeable. The raw observation route requires version 2; the legacy route retains only events. Excess literal fields cannot add private configuration to this boundary. */
export function rejectedWireRequests(client: HanamiPlatformClient, viewer: MiUser, path: '/internal/v1/recommendations/advance' | '/internal/v1/recommendations/validate') {
	// @ts-expect-error Only the seven signed wire paths are available.
	void client.request(viewer, '/internal/v1/private', {});
	// @ts-expect-error A recommendation requires its limit and image filter.
	void client.request(viewer, '/internal/v1/recommendations', {});
	// @ts-expect-error Advance input is not a recommendation input.
	void client.request(viewer, '/internal/v1/recommendations', wireRequests.advance);
	// @ts-expect-error A continuation alone omits the accepted ID set.
	void client.request(viewer, '/internal/v1/recommendations/advance', { continuation: 'opaque' });
	// @ts-expect-error A validation token is not advance input.
	void client.request(viewer, '/internal/v1/recommendations/advance', wireRequests.validate);
	// @ts-expect-error Validate requires the validation token.
	void client.request(viewer, '/internal/v1/recommendations/validate', {});
	// @ts-expect-error Advance input is not validate input.
	void client.request(viewer, '/internal/v1/recommendations/validate', wireRequests.advance);
	// @ts-expect-error Feedback requires user action and target identity.
	void client.request(viewer, '/internal/v1/feedback', { eventId: 'e' });
	// @ts-expect-error Search input is not feedback input.
	void client.request(viewer, '/internal/v1/feedback', wireRequests.search);
	// @ts-expect-error Legacy impressions require their event batch.
	void client.request(viewer, '/internal/v1/impressions', {});
	// @ts-expect-error Raw observation input must use its own route.
	void client.request(viewer, '/internal/v1/impressions', wireRequests.observations);
	// @ts-expect-error Raw observations require the version discriminator.
	void client.request(viewer, '/internal/v1/observations', { observations: wireRequests.observations.observations });
	// @ts-expect-error Legacy events cannot be signed as raw observations.
	void client.request(viewer, '/internal/v1/observations', wireRequests.impressions);
	// @ts-expect-error Search requires its query and protocol version.
	void client.request(viewer, '/internal/v1/search', {});
	// @ts-expect-error Recommendation input is not search input.
	void client.request(viewer, '/internal/v1/search', wireRequests.recommendations);
	// @ts-expect-error Unknown literal fields cannot carry private configuration.
	void client.request(viewer, '/internal/v1/recommendations', { ...wireRequests.recommendations, privateMarker: true });
	// @ts-expect-error Advance admits only the opaque token and accepted IDs.
	void client.request(viewer, '/internal/v1/recommendations/advance', { ...wireRequests.advance, privateMarker: true });
	// @ts-expect-error Validation admits only its opaque token.
	void client.request(viewer, '/internal/v1/recommendations/validate', { ...wireRequests.validate, privateMarker: true });
	// @ts-expect-error Feedback cannot carry private configuration.
	void client.request(viewer, '/internal/v1/feedback', { ...wireRequests.feedback, privateMarker: true });
	// @ts-expect-error Legacy impressions cannot carry private configuration.
	void client.request(viewer, '/internal/v1/impressions', { ...wireRequests.impressions, privateMarker: true });
	// @ts-expect-error Raw observations cannot carry private configuration.
	void client.request(viewer, '/internal/v1/observations', { ...wireRequests.observations, privateMarker: true });
	// @ts-expect-error Signed search cannot carry private configuration.
	void client.request(viewer, '/internal/v1/search', { ...wireRequests.search, privateMarker: true });
	// @ts-expect-error Unknown fields are also forbidden in a nested target.
	void client.request(viewer, '/internal/v1/feedback', { ...wireRequests.feedback, target: { kind: 'note', id: 'note1', privateMarker: true } });
	// @ts-expect-error Version 2 identifies the raw observation protocol.
	void client.request(viewer, '/internal/v1/observations', { ...wireRequests.observations, version: 1 });
	// @ts-expect-error The signed search protocol is v2.
	void client.request(viewer, '/internal/v1/search', { ...wireRequests.search, hanamiSearchVersion: 'v1' });
	// @ts-expect-error A union path cannot silently accept input for just one member.
	void client.request(viewer, path, wireRequests.validate);
	// @ts-expect-error Explicit union instantiation cannot bypass path/input correlation.
	void client.request<'/internal/v1/recommendations/advance' | '/internal/v1/recommendations/validate'>(viewer, path, wireRequests.validate);
	// @ts-expect-error The caller cannot choose an unverified output type.
	void client.request<{ privateMarker: string }>(viewer, '/internal/v1/search', wireRequests.search);
	void client.request(viewer, '/internal/v1/recommendations', { limit: 1, imageFilter: 'without_image' });
	void client.request(viewer, '/internal/v1/recommendations', { limit: 1, imageFilter: 'with_image', cursor: 'opaque', refresh: false, withFiles: false });
	void client.request(viewer, '/internal/v1/search', { ...wireRequests.search, cursor: 'opaque' });
}
