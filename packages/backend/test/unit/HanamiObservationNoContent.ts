import { setImmediate } from 'node:timers/promises';
import { describe, expect, jest, test } from '@jest/globals';
import Fastify from 'fastify';
import { detailObservation } from '../utils/HanamiInteractionsFixture.js';
import type { Config } from '@/config.js';
import type { MiLocalUser } from '@/models/User.js';
import { HanamiRecommendationsService } from '@/core/hanamifeed/HanamiRecommendationsService.js';
import { HanamiPlatformError } from '@/core/hanamifeed/HanamiPlatformClient.js';
import { ApiCallService } from '@/server/api/ApiCallService.js';
import ImpressionsEndpoint, { meta, paramDef } from '@/server/api/endpoints/hanami-impressions.js';
import { genOpenapiSpec } from '@/server/api/openapi/gen-spec.js';

const viewer = { id: 'alice', host: null } as MiLocalUser;
const v4 = { version: 4, observations: [detailObservation()] };
const legacy = { events: [{ eventId: 'legacy-a', snapshotId: 'snapshot-a', entryId: 'entry-a' }] };

function fixture() {
	const request = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({ accepted: 1, duplicates: 0 });
	const service = new HanamiRecommendationsService(...[{ request }, {}] as unknown as ConstructorParameters<typeof HanamiRecommendationsService>);
	const endpoint = new ImpressionsEndpoint(service);
	const api = new ApiCallService(...[
		{ enableIpLogging: false }, {}, {},
		{ authenticate: async () => [viewer, null] }, {},
		{ getUserRoles: async () => [], getUserPolicies: async () => ({ hanamiTlAvailable: true }) },
		{ logger: { error: jest.fn() } },
	] as unknown as ConstructorParameters<typeof ApiCallService>);
	const server = Fastify();
	server.post<{ Body: Record<string, unknown>; Querystring: Record<string, unknown> }>('/api/hanami-impressions', (request, reply) => {
		api.handleRequest({ name: 'hanami-impressions', meta, params: paramDef, exec: endpoint.exec }, request, reply);
	});
	return {
		request,
		post: (payload: Record<string, unknown>) => server.inject({ method: 'POST', url: '/api/hanami-impressions', payload }),
		close: async () => { api.dispose(); await server.close(); },
	};
}

/** Oracle: the approved 2026-11-10 public contract requires HTTP 204 and zero response bytes after internal receipt validation, for both v4 and retained legacy input. Fastify injection exercises the real ApiCallService and endpoint without a socket, DB or replacement response serializer; only the signed client and authentication/policy dependencies are doubled. */
describe('Hanami observation bodyless public response', () => {
	test.each<[string, Record<string, unknown>, { accepted: number; duplicates: number }]>([
		['v4 newly saved', v4, { accepted: 1, duplicates: 0 }],
		['v4 duplicate', v4, { accepted: 0, duplicates: 1 }],
		['legacy newly saved', legacy, { accepted: 1, duplicates: 0 }],
		['legacy duplicate', legacy, { accepted: 0, duplicates: 1 }],
	])('returns 204 with no body for %s', async (_name, payload, receipt) => {
		const f = fixture();
		try {
			f.request.mockResolvedValue({ ...receipt, extraFlag: true, extraIds: ['synthetic-id'], extraString: 'synthetic-value' });
			const response = await f.post(payload);
			expect(f.request).toHaveBeenCalledWith(viewer, 'events' in payload ? '/internal/v1/impressions' : '/internal/v1/observations', payload);
			expect(response.statusCode).toBe(204);
			expect(response.rawPayload.byteLength).toBe(0);
			expect(response.body).toBe('');
		} finally { await f.close(); }
	});

	/** Oracle: no response may be sent while the signed request is pending. A delayed valid receipt completes with 204; delayed invalid counts must still become UNAVAILABLE, never an early success. */
	test.each([
		{ receipt: { accepted: 1, duplicates: 0 }, status: 204 },
		{ receipt: { accepted: 0, duplicates: 0 }, status: 503 },
	])('waits for the internal receipt before returning status $status', async ({ receipt, status }) => {
		const f = fixture();
		let resolve!: (value: unknown) => void;
		let started!: () => void;
		const begun = new Promise<void>(yes => { started = yes; });
		f.request.mockImplementation(() => { started(); return new Promise(yes => { resolve = yes; }); });
		try {
			let responded = false;
			const pending = f.post(v4).then(response => { responded = true; return response; });
			await begun;
			await setImmediate();
			expect(responded).toBe(false);
			resolve(receipt);
			const response = await pending;
			expect(response.statusCode).toBe(status);
			if (status === 204) expect(response.rawPayload.byteLength).toBe(0);
			else expect(response.json()).toMatchObject({ error: { code: 'UNAVAILABLE' } });
		} finally { resolve(receipt); await f.close(); }
	});

	/** Oracle: internal counts remain nonnegative safe integers whose sum equals the entire one-record batch; changing only the endpoint response must not turn malformed or partial receipts into success. */
	test.each([
		null, {}, { accepted: 0, duplicates: 0 }, { accepted: 2, duplicates: 0 },
		{ accepted: -1, duplicates: 2 }, { accepted: 2, duplicates: -1 },
		{ accepted: 0.5, duplicates: 0.5 }, { accepted: 1, duplicates: '0' },
		{ accepted: 1 }, { accepted: Number.MAX_SAFE_INTEGER + 1, duplicates: 0 },
	])('keeps invalid internal receipt %p out of the successful response path', async receipt => {
		const f = fixture();
		try {
			f.request.mockResolvedValue(receipt);
			const response = await f.post(v4);
			expect(response.statusCode).toBe(503);
			expect(response.json()).toMatchObject({ error: { code: 'UNAVAILABLE' } });
		} finally { await f.close(); }
	});

	test.each<[Error, number, string]>([
		[new Error('private-upstream-error'), 503, 'UNAVAILABLE'],
		[new HanamiPlatformError('REFRESH_REQUIRED'), 409, 'REFRESH_REQUIRED'],
	])('preserves a failed signed request as an error: %s', async (error, status, code) => {
		const f = fixture();
		try {
			f.request.mockRejectedValue(error);
			const response = await f.post(v4);
			expect(response.statusCode).toBe(status);
			expect(response.json()).toMatchObject({ error: { code } });
			expect(response.body).not.toContain('private-upstream-error');
		} finally { await f.close(); }
	});

	/** Oracle: the public OpenAPI contract has a successful 204 response without content, with no 200 receipt schema. The actual generator must express this, not merely an endpoint fixture. */
	test('generates only a bodyless 204 success response for the observation API', () => {
		const spec = genOpenapiSpec({ version: 'test', apiUrl: 'https://misskey.test/api' } as Config);
		const responses = spec.paths['/hanami-impressions'].post.responses;
		expect(Object.keys(responses).filter(status => status.startsWith('2'))).toEqual(['204']);
		expect(responses['204']).not.toHaveProperty('content');
	});
});
