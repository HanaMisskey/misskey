/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, reactive } from 'vue';
import type { App, ShallowRef } from 'vue';
import type { Clip } from 'misskey-js/entities.js';
import type { Column } from '@/deck.js';
import ClipColumn from '@/ui/deck/clip-column.vue';

const boundary = vi.hoisted(() => ({
	api: vi.fn(),
	updateColumn: vi.fn(),
	useChannel: vi.fn(),
	currentClip: null as ShallowRef<Clip | null> | null,
}));

vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: boundary.api }));
vi.mock('@/deck.js', () => ({ updateColumn: boundary.updateColumn }));
vi.mock('@/stream.js', () => ({ useStream: () => ({ useChannel: boundary.useChannel }) }));
vi.mock('@/i.js', () => ({ $i: { id: 'owner' } }));
vi.mock('@/os.js', () => ({ select: vi.fn(), pageWindow: vi.fn() }));
vi.mock('@/cache.js', () => ({
	clipsCache: { fetch: vi.fn() },
	favoritedClipsCache: { fetch: vi.fn() },
}));
vi.mock('@/components/MkNotesTimeline.vue', () => ({ default: { render: () => null } }));
vi.mock('@/ui/deck/column.vue', async () => {
	const { defineComponent, h, inject } = await import('vue');
	return {
		default: defineComponent({
			setup(_props, { slots }) {
				boundary.currentClip = inject<ShallowRef<Clip | null>>('currentClip')!;
				return () => h('section', [
					h('output', { 'data-testid': 'current-clip' }, boundary.currentClip?.value?.id ?? 'none'),
					slots.default?.(),
				]);
			},
		}),
	};
});

function clip(id: string, name = id): Clip {
	return { id, name, userId: 'owner' } as Clip;
}

async function settle() {
	await Promise.resolve();
	await nextTick();
}

describe('clip column selection', () => {
	let app: App;
	let host: HTMLDivElement;
	let column: Column;
	let pending: { clipId: string; resolve: (value: Clip) => void; reject: (reason: Error) => void }[];
	let subscriptions: { on: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }[];
	let mounted: boolean;

	beforeEach(() => {
		boundary.api.mockReset();
		boundary.updateColumn.mockReset();
		boundary.useChannel.mockReset();
		boundary.currentClip = null;
		pending = [];
		subscriptions = [];
		boundary.api.mockImplementation((endpoint: string, params: { clipId: string }) => {
			if (endpoint === 'clips/notes') return Promise.resolve([]);
			if (endpoint !== 'clips/show') throw new Error(`Unexpected endpoint: ${endpoint}`);
			const request = Promise.withResolvers<Clip>();
			pending.push({ clipId: params.clipId, resolve: request.resolve, reject: request.reject });
			return request.promise;
		});
		boundary.useChannel.mockImplementation(() => {
			const subscription = { on: vi.fn(), dispose: vi.fn() };
			subscriptions.push(subscription);
			return subscription;
		});
		column = reactive<Column>({ id: 'column', type: 'clip', name: null, width: 300, clipId: 'A' });
		host = document.createElement('div');
		document.body.append(host);
		app = createApp(defineComponent({
			setup: () => () => h(ClipColumn, { column, isStacked: false }),
		}));
		app.component('MkResult', defineComponent({
			setup: () => () => h('div', { 'data-testid': 'not-found' }),
		}));
		app.mount(host);
		mounted = true;
	});

	afterEach(() => {
		if (mounted) app.unmount();
		host.remove();
	});

	/** Oracle: a loaded selection is provided to note actions and its live updates still reload its notes. */
	test('provides the selected clip and subscribes to its updates', async () => {
		pending[0].resolve(clip('A'));
		await settle();
		expect(boundary.currentClip?.value?.id).toBe('A');
		expect(host.querySelector('[data-testid="current-clip"]')?.textContent).toBe('A');
		expect(boundary.updateColumn).toHaveBeenCalledWith('column', { timelineNameCache: 'A' });
		expect(boundary.useChannel).toHaveBeenCalledWith('clip', { clipId: 'A' });
		const onUpdated = subscriptions[0].on.mock.calls.find(([event]) => event === 'updated')?.[1];
		expect(onUpdated).toBeTypeOf('function');
		onUpdated();
		await settle();
		expect(boundary.api).toHaveBeenCalledWith('clips/notes', expect.objectContaining({ clipId: 'A' }));
	});

	/** Oracle: after choosing B, a response belonging to the previous A cannot change note actions or write A's title. */
	test('keeps B and its title when the previous A succeeds later', async () => {
		column.clipId = 'B';
		await nextTick();
		pending[1].resolve(clip('B', 'selected B'));
		await settle();
		expect(boundary.currentClip?.value?.id).toBe('B');
		boundary.updateColumn.mockClear();
		pending[0].resolve(clip('A', 'stale A'));
		await settle();
		expect(boundary.currentClip?.value?.id).toBe('B');
		expect(boundary.updateColumn).not.toHaveBeenCalled();
	});

	/** Oracle: failure of an obsolete selection says nothing about B's existence or its successful display. */
	test('keeps B visible when the previous A fails later', async () => {
		column.clipId = 'B';
		await nextTick();
		pending[1].resolve(clip('B'));
		await settle();
		pending[0].reject(new Error('A is no longer available'));
		await settle();
		expect(host.querySelector('[data-testid="not-found"]')).toBeNull();
		expect(boundary.currentClip?.value?.id).toBe('B');
	});

	/** Oracle: an empty selection has no current clip, even if its previous request subsequently succeeds. */
	test('does not restore A after the selection is cleared', async () => {
		column.clipId = undefined;
		await nextTick();
		pending[0].resolve(clip('A'));
		await settle();
		expect(boundary.currentClip?.value).toBeNull();
		expect(boundary.updateColumn).not.toHaveBeenCalled();
		expect(subscriptions[0].dispose).toHaveBeenCalledOnce();
	});

	/** Oracle: a cleared selection cannot become not-found because an obsolete request failed. */
	test('keeps the empty selection clear when A fails later', async () => {
		column.clipId = undefined;
		await nextTick();
		pending[0].reject(new Error('A is no longer available'));
		await settle();
		expect(host.querySelector('[data-testid="not-found"]')).toBeNull();
	});

	/** Oracle: an unmounted column no longer owns pending requests and cannot update shared column settings. */
	test('does not apply a successful request after unmount', async () => {
		const providedClip = boundary.currentClip;
		app.unmount();
		mounted = false;
		pending[0].resolve(clip('A'));
		await settle();
		expect(providedClip?.value).toBeNull();
		expect(boundary.updateColumn).not.toHaveBeenCalled();
		expect(subscriptions[0].dispose).toHaveBeenCalledOnce();
	});

	/** Oracle: A → B → A creates a new selection of A; only the latest request may supply its current name. */
	test('distinguishes a new request for the same clip ID', async () => {
		column.clipId = 'B';
		await nextTick();
		column.clipId = 'A';
		await nextTick();
		expect(pending.map(request => request.clipId)).toEqual(['A', 'B', 'A']);
		pending[2].resolve(clip('A', 'current A'));
		await settle();
		boundary.updateColumn.mockClear();
		pending[0].resolve(clip('A', 'obsolete A'));
		pending[1].reject(new Error('obsolete B'));
		await settle();
		expect(boundary.currentClip?.value?.name).toBe('current A');
		expect(boundary.updateColumn).not.toHaveBeenCalled();
		expect(host.querySelector('[data-testid="not-found"]')).toBeNull();
	});

	/** Oracle: a failure belonging to the current selection must still show not-found rather than stale clip actions. */
	test('shows not-found when the current clip request fails', async () => {
		pending[0].reject(new Error('current clip is no longer available'));
		await settle();
		expect(boundary.currentClip?.value).toBeNull();
		expect(host.querySelector('[data-testid="not-found"]')).not.toBeNull();
	});
});
