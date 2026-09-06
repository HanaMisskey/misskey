/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import Results from '@/components/HanamiSearchV2Results.vue';

const { request, appeared } = vi.hoisted(() => ({ request: vi.fn(), appeared: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: request }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { loadMore: 'More', noNotes: 'No notes' } } }));
vi.mock('@/events.js', () => ({ useGlobalEvent: vi.fn() }));
vi.mock('@/preferences.js', async () => {
	const { ref } = await import('vue');
	return { prefer: { s: { enablePullToRefresh: true, animation: false }, r: { enableInfiniteScroll: ref(true) } } };
});
vi.mock('@/os.js', () => ({ contextMenu: vi.fn() }));
vi.mock('@/utility/timeline-date-separate.js', () => ({ isSeparatorNeeded: () => false, getSeparatorInfo: () => null }));
vi.mock('@/components/MkPaginationControl.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/MkPullToRefresh.vue', () => ({ default: { props: ['refresher'], template: '<div><button @click="refresher()">Refresh</button><slot /></div>' } }));
vi.mock('@/components/MkNote.vue', () => ({ default: { props: ['note'], template: '<p>{{ note.id }}</p>' } }));
vi.mock('@/components/MkNoteMediaGrid.vue', () => ({ default: { props: ['note'], template: '<p>{{ note.id }}</p>' } }));
vi.mock('@/components/MkButton.vue', () => ({ default: { template: '<button><slot /></button>' } }));

function mount() {
	return render(Results, {
		props: { params: { query: '花' } },
		global: { directives: { appear: { mounted: (_element, binding) => appeared(binding.value) } }, stubs: {
			MkAd: true,
			MkLoading: { template: '<p>Loading</p>' },
			MkError: { emits: ['retry'], template: '<button @click="$emit(\'retry\')">Retry</button>' },
			MkResult: { props: ['text'], template: '<p>{{ text }}</p>' },
		} },
	});
}

afterEach(() => { cleanup(); request.mockReset(); appeared.mockReset(); });

/** Oracle: the search screen must expose continuation even for an empty page, and offer retry without hiding earlier notes. */
describe('HanamiSearch v2 result controls', () => {
	test('shows a continuation control for an empty page and renders the next notes', async () => {
		request.mockResolvedValueOnce({ notes: [], nextCursor: 'second' }).mockResolvedValueOnce({ notes: [{ id: 'visible-note' }], nextCursor: null });
		const view = mount();
		await fireEvent.click(await view.findByText('More'));
		await view.findByText('visible-note');
		expect(view.queryByRole('button', { name: 'More' })).toBeNull();
		expect(request.mock.calls[1]).toEqual(['notes/hanamisearch-v2', expect.objectContaining({ query: '花', cursor: 'second' })]);
	});

	/** Oracle: the shared list passes a continuation callback to its visibility directive when infinite scrolling is enabled. */
	test('loads the next page through the shared infinite-scroll callback', async () => {
		request.mockResolvedValueOnce({ notes: [{ id: 'first-note' }], nextCursor: 'second' })
			.mockResolvedValueOnce({ notes: [{ id: 'second-note' }], nextCursor: null });
		const view = mount();
		await view.findByText('first-note');
		const callback = appeared.mock.calls.map(call => call[0]).find(value => typeof value === 'function');
		expect(callback).toBeTypeOf('function');
		callback();
		await view.findByText('second-note');
		expect(request.mock.calls[1][1].cursor).toBe('second');
	});

	/** Oracle: refreshing and changing the display use the shared paginator, without discarding or refetching results just to switch layout. */
	test('uses shared refresh and preserves results when switching to the grid', async () => {
		request.mockResolvedValue({ notes: [{ id: 'first-note' }], nextCursor: null });
		const view = mount();
		await view.findByText('first-note');
		await view.rerender({ showAsGrid: true });
		expect(view.getByText('first-note')).toBeTruthy();
		expect(request).toHaveBeenCalledTimes(1);
		await fireEvent.click(view.getByText('Refresh'));
		await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
		expect(request.mock.calls[1][1]).toEqual({ query: '花' });
	});

	test('keeps visible notes during failure and retries from the button', async () => {
		request.mockResolvedValueOnce({ notes: [{ id: 'first-note' }], nextCursor: 'second' })
			.mockRejectedValueOnce(new Error('unavailable'))
			.mockResolvedValueOnce({ notes: [{ id: 'second-note' }], nextCursor: null });
		const view = mount();
		await fireEvent.click(await view.findByText('More'));
		expect(await view.findByText('first-note')).toBeTruthy();
		await fireEvent.click(await view.findByText('Retry'));
		await view.findByText('second-note');
		expect(view.getByText('first-note')).toBeTruthy();
	});

	test('resets the continuation when search conditions change', async () => {
		request.mockResolvedValueOnce({ notes: [{ id: 'old-note' }], nextCursor: 'old' })
			.mockResolvedValueOnce({ notes: [{ id: 'new-note' }], nextCursor: null });
		const view = mount();
		await view.findByText('old-note');
		await view.rerender({ params: { query: '空' } });
		await view.findByText('new-note');
		expect(view.queryByText('old-note')).toBeNull();
		await waitFor(() => expect(request.mock.calls[1][1].cursor).toBeUndefined());
	});
});
