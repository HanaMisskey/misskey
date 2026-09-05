/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import Results from '@/components/HanamiSearchV2Results.vue';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: request }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { loadMore: 'More', noNotes: 'No notes' } } }));
vi.mock('@/events.js', () => ({ useGlobalEvent: vi.fn() }));
vi.mock('@/components/MkNote.vue', () => ({ default: { props: ['note'], template: '<p>{{ note.id }}</p>' } }));
vi.mock('@/components/MkNoteMediaGrid.vue', () => ({ default: { props: ['note'], template: '<p>{{ note.id }}</p>' } }));
vi.mock('@/components/MkButton.vue', () => ({ default: { template: '<button><slot /></button>' } }));

function mount() {
	return render(Results, {
		props: { params: { query: '花' } },
		global: { stubs: {
			MkLoading: { template: '<p>Loading</p>' },
			MkError: { emits: ['retry'], template: '<button @click="$emit(\'retry\')">Retry</button>' },
			MkResult: { props: ['text'], template: '<p>{{ text }}</p>' },
		} },
	});
}

afterEach(() => { cleanup(); request.mockReset(); });

/** Oracle: the search screen must expose continuation even for an empty page, and offer retry without hiding earlier notes. */
describe('HanamiSearch v2 result controls', () => {
	test('shows a continuation control for an empty page and renders the next notes', async () => {
		request.mockResolvedValueOnce({ notes: [], nextCursor: 'second' }).mockResolvedValueOnce({ notes: [{ id: 'visible-note' }], nextCursor: null });
		const view = mount();
		await fireEvent.click(await view.findByText('More'));
		await view.findByText('visible-note');
		expect(view.queryByText('More')).toBeNull();
		expect(request.mock.calls[1]).toEqual(['notes/hanamisearch-v2', expect.objectContaining({ query: '花', cursor: 'second' })]);
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
