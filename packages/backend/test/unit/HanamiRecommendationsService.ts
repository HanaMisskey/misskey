import { describe, expect, jest, test } from '@jest/globals';
import type { MiUser } from '@/models/_.js';
import { HanamiPlatformError } from '@/core/hanamifeed/HanamiPlatformClient.js';
import { HanamiRecommendationsService } from '@/core/hanamifeed/HanamiRecommendationsService.js';

const viewer = { id: 'alice', host: null } as MiUser;
const input = { limit: 3, imageFilter: 'any' as const, refresh: false, withFiles: true };
const reference = (id: string) => ({ entryId: `entry-${id}`, noteId: id, guard: { contentDigest: 'a'.repeat(64), validUntilMs: 9_000_000_000_000 } });
const page = (ids: string[], nextCursor: string | null = null) => ({ kind: 'page', page: { items: ids.map(reference), nextCursor, snapshotId: 'snapshot1', algorithmVersion: 'local-v0.3.0', revision: 0, validationToken: 'opaque-validation' } });
const authorize = (ids: string[], continuation = 'opaque-step') => ({ kind: 'authorize', continuation, items: ids.map(reference) });

function fixture() {
	const request = jest.fn<(...args: unknown[]) => Promise<unknown>>();
	const pack = jest.fn<(refs: ReturnType<typeof reference>[]) => Promise<{ id: string; text?: string }[]>>().mockImplementation(async refs => refs.map(item => ({ id: item.noteId })));
	const access = { packReferences: async (refs: ReturnType<typeof reference>[], _me: MiUser, afterPack?: () => Promise<void>) => {
		const notes = await pack(refs);
		await afterPack?.();
		return notes;
	} };
	const service = new HanamiRecommendationsService(...[{ request }, access] as unknown as ConstructorParameters<typeof HanamiRecommendationsService>);
	return { service, request, pack };
}

/** Oracle: docs/hanami-recommendations-page-contract.md gives page ownership to the service. Misskey sends current authorized IDs, accepts the committed order, and exposes only the public allowlist. No local page storage participates. */
describe('signed page references and final validation', () => {
	test('returns the committed order and sends the complete user filter request', async () => {
		const f = fixture();
		f.request.mockResolvedValueOnce(page(['a', 'z', 'm'])).mockResolvedValueOnce({ valid: true });
		f.pack.mockResolvedValue([{ id: 'z', text: 'Z' }, { id: 'm', text: 'M' }, { id: 'a', text: 'A' }]);
		expect(await f.service.getRecommendations(viewer, input)).toEqual({
			items: [{ entryId: 'entry-a', note: { id: 'a', text: 'A' } }, { entryId: 'entry-z', note: { id: 'z', text: 'Z' } }, { entryId: 'entry-m', note: { id: 'm', text: 'M' } }],
			nextCursor: null, snapshotId: 'snapshot1', algorithmVersion: 'local-v0.3.0', revision: 0,
		});
		expect(f.request.mock.calls).toEqual([[viewer, '/internal/v1/recommendations', input], [viewer, '/internal/v1/recommendations/validate', { validationToken: 'opaque-validation' }]]);
	});

	test('reports only fresh authorized IDs and uses the remote committed winner', async () => {
		const f = fixture();
		f.request.mockResolvedValueOnce(authorize(['a', 'deleted', 'z']))
			.mockResolvedValueOnce(authorize(['m'], 'second-step')).mockResolvedValueOnce(page(['z', 'm'], 'v2.next'))
			.mockResolvedValueOnce({ valid: true });
		f.pack.mockImplementation(async refs => refs.filter(item => item.noteId !== 'deleted').map(item => ({ id: item.noteId })));
		const result = await f.service.getRecommendations(viewer, input);
		expect(f.request.mock.calls.slice(1, 3)).toEqual([
			[viewer, '/internal/v1/recommendations/advance', { continuation: 'opaque-step', acceptedNoteIds: ['a', 'z'] }],
			[viewer, '/internal/v1/recommendations/advance', { continuation: 'second-step', acceptedNoteIds: ['m'] }],
		]);
		expect(result.items.map(item => item.note.id)).toEqual(['z', 'm']);
		expect(result.nextCursor).toBe('v2.next');
	});

	test.each([undefined, 'v2.saved'])('uses the service page for cursor %s and ignores unknown internal fields', async cursor => {
		const f = fixture();
		const remote = page(['z', 'a'], 'v2.next');
		Object.assign(remote.page, { privateMarker: 'not-public' });
		Object.assign(remote.page.items[0], { privateMarker: 'not-public' });
		f.request.mockResolvedValueOnce(remote).mockResolvedValueOnce({ valid: true, privateMarker: 'not-public' });
		const result = await f.service.getRecommendations(viewer, { ...input, cursor });
		expect(Object.keys(result).sort()).toEqual(['algorithmVersion', 'items', 'nextCursor', 'revision', 'snapshotId']);
		expect(result.items.map(item => Object.keys(item).sort())).toEqual([['entryId', 'note'], ['entryId', 'note']]);
		expect(JSON.stringify(result)).not.toContain('not-public');
	});

	test('validates an empty page and retains its continuation', async () => {
		const f = fixture();
		f.request.mockResolvedValueOnce(page([], 'v2.next')).mockResolvedValueOnce({ valid: true });
		const result = await f.service.getRecommendations(viewer, input);
		expect([result.items, result.nextCursor]).toEqual([[], 'v2.next']);
		expect(f.request).toHaveBeenLastCalledWith(viewer, '/internal/v1/recommendations/validate', { validationToken: 'opaque-validation' });
	});

	test.each(['REFRESH_REQUIRED', 'UNAVAILABLE'] as const)('propagates final %s instead of returning packed notes', async code => {
		const f = fixture();
		f.request.mockResolvedValueOnce(page(['a'])).mockRejectedValueOnce(new HanamiPlatformError(code));
		await expect(f.service.getRecommendations(viewer, input)).rejects.toMatchObject({ code });
		expect(f.pack).toHaveBeenCalledTimes(1);
	});

	test('waits for the opaque final validation after packing, including delayed completion', async () => {
		const f = fixture();
		let release!: (value: unknown) => void;
		let started!: () => void;
		const pending = new Promise(resolve => { release = resolve; });
		const waiting = new Promise<void>(resolve => { started = resolve; });
		f.request.mockResolvedValueOnce(page(['a'])).mockImplementationOnce(async () => {
			expect(f.pack).toHaveBeenCalledTimes(1);
			started();
			return pending;
		});
		const response = f.service.getRecommendations(viewer, input);
		try {
			await expect(Promise.race([waiting.then(() => 'waiting'), response.then(() => 'returned')])).resolves.toBe('waiting');
			release({ valid: true });
			expect((await response).items.map(item => item.note.id)).toEqual(['a']);
			expect(f.pack).toHaveBeenCalledTimes(1);
		} finally { release({ valid: true }); }
	});

	test.each([null, {}, { valid: false }, { valid: 'true' }])('rejects malformed validation ACK %p', async ack => {
		const f = fixture();
		f.request.mockResolvedValueOnce(page(['a'])).mockResolvedValueOnce(ack);
		await expect(f.service.getRecommendations(viewer, input)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
	});

	test('rejects an opaque continuation cycle without another round', async () => {
		const f = fixture();
		f.request.mockResolvedValue(authorize(['a']));
		await expect(f.service.getRecommendations(viewer, input)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
		expect(f.request).toHaveBeenCalledTimes(2);
	});

	test.each([
		{ kind: 'unknown' }, { kind: 'authorize', continuation: '', items: [] },
		{ kind: 'authorize', continuation: 'step', items: [{ entryId: 'e', noteId: 'a' }] },
		{ kind: 'page', page: { ...page(['a']).page, validationToken: '' } },
		{ kind: 'page', page: { ...page(['a']).page, items: [{ ...reference('a'), guard: { contentDigest: 'invalid', validUntilMs: 1 } }] } },
	])('rejects malformed reference protocol %p before packing', async invalid => {
		const f = fixture();
		f.request.mockResolvedValue(invalid);
		await expect(f.service.getRecommendations(viewer, input)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
		expect(f.pack).not.toHaveBeenCalled();
	});

	/** Oracle: observations are raw measurements. The service ACK counts records and identifies completed series; the Misskey relay must not interpret area or elapsed time. */
	test('relays raw observation records and completion IDs with unchanged event identity', async () => {
		const f = fixture();
		const observations = { version: 2 as const, observations: [{ eventId: 'observation-a', snapshotId: 's', entryId: 'e', sequence: 0, elapsedMs: 0, visibleArea: 1, availableArea: 100, documentVisible: true, ended: false }] };
		f.request.mockResolvedValue({ accepted: 1, duplicates: 0, completedEventIds: ['observation-a'] });
		await expect(f.service.submitImpressions(viewer, observations)).resolves.toEqual({ accepted: 1, duplicates: 0, completedEventIds: ['observation-a'] });
		expect(f.request).toHaveBeenCalledWith(viewer, '/internal/v1/observations', observations);
	});

	test('keeps feedback and legacy retry identity while propagating explicit migration failure', async () => {
		const f = fixture();
		const feedback = { eventId: 'feedback1', target: { kind: 'author' as const, id: 'bob' }, action: 'less' as const, snapshotId: 'snapshot1', entryId: 'entry-a' };
		f.request.mockResolvedValueOnce({ revision: 2, refreshRequired: true }).mockRejectedValueOnce(new HanamiPlatformError('REFRESH_REQUIRED'));
		await expect(f.service.submitFeedback(viewer, feedback)).resolves.toEqual({ revision: 2, refreshRequired: true });
		await expect(f.service.submitImpressions(viewer, { events: [{ eventId: 'old', snapshotId: 's', entryId: 'e' }] })).rejects.toMatchObject({ code: 'REFRESH_REQUIRED' });
	});
});
