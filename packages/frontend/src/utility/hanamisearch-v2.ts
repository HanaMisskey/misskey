/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, ref, shallowRef } from 'vue';
import type { IPaginator, MisskeyEntity } from '@/utility/paginator.js';

export type HanamiSearchV2Params = {
	query: string;
	host?: string;
	userId?: string;
	channelId?: string;
	onlyWithFiles?: boolean;
	limit?: number;
};

export function createHanamiSearchV2<T extends { id: string }>(request: (params: HanamiSearchV2Params & { cursor?: string }) => Promise<{ notes: T[]; nextCursor: string | null }>) {
	const notes = shallowRef<T[]>([]);
	const nextCursor = ref<string | null>(null);
	const loading = ref(false);
	const error = ref(false);
	let params: HanamiSearchV2Params | null = null;
	let generation = 0;
	let disposed = false;
	const hasPage = ref(false);

	async function loadMore(): Promise<void> {
		if (disposed || params == null || loading.value || (hasPage.value && nextCursor.value == null)) return;
		const currentGeneration = generation;
		loading.value = true;
		error.value = false;
		try {
			const page = await request({ ...params, ...(nextCursor.value == null ? {} : { cursor: nextCursor.value }) });
			if (generation !== currentGeneration) return;
			const ids = new Set(notes.value.map(note => note.id));
			notes.value = [...notes.value, ...page.notes.filter(note => {
				if (ids.has(note.id)) return false;
				ids.add(note.id);
				return true;
			})];
			nextCursor.value = page.nextCursor;
			hasPage.value = true;
		} catch {
			if (generation === currentGeneration) error.value = true;
		} finally {
			if (generation === currentGeneration) loading.value = false;
		}
	}

	async function search(newParams: HanamiSearchV2Params): Promise<void> {
		if (disposed) return;
		generation++;
		params = { ...newParams };
		notes.value = [];
		nextCursor.value = null;
		hasPage.value = false;
		loading.value = false;
		error.value = false;
		await loadMore();
	}

	function dispose(): void {
		disposed = true;
		generation++;
		loading.value = false;
	}

	return { notes, nextCursor, loading, error, hasPage, search, loadMore, dispose };
}

export function createHanamiSearchV2Paginator<T extends MisskeyEntity>(params: () => HanamiSearchV2Params, request: (params: HanamiSearchV2Params & { cursor?: string }) => Promise<{ notes: T[]; nextCursor: string | null }>) {
	const state = createHanamiSearchV2<T & MisskeyEntity>(request);
	const queued: (T & MisskeyEntity)[] = [];
	const paginator = {
		items: state.notes,
		queuedAheadItemsCount: ref(0),
		fetching: computed(() => state.loading.value && !state.hasPage.value),
		fetchingOlder: computed(() => state.loading.value && state.hasPage.value),
		fetchingNewer: ref(false),
		canFetchOlder: computed(() => state.nextCursor.value != null),
		canFetchNewer: ref(false),
		canSearch: false,
		error: computed(() => state.error.value && !state.hasPage.value),
		fetchOlderError: computed(() => state.error.value && state.hasPage.value),
		computedParams: null,
		initialId: null,
		initialDate: null,
		initialDirection: 'older' as const,
		noPaging: false,
		searchQuery: ref<string | null>(null),
		order: ref<'newest' | 'oldest'>('newest'),
		init: () => state.search(params()),
		reload: () => state.search(params()),
		fetchOlder: state.loadMore,
		async fetchNewer() {},
		// 取得済み末尾を切り捨てると、次のcursorでは捨てた検索結果へ戻れない。
		trim() {},
		unshiftItems(items: (T & MisskeyEntity)[]) { state.notes.value = [...items, ...state.notes.value]; },
		pushItems(items: (T & MisskeyEntity)[]) { state.notes.value = [...state.notes.value, ...items]; },
		prepend(item: T & MisskeyEntity) { state.notes.value = [item, ...state.notes.value]; },
		enqueue(item: T & MisskeyEntity) { queued.unshift(item); paginator.queuedAheadItemsCount.value = queued.length; },
		releaseQueue() { paginator.unshiftItems(queued.splice(0)); paginator.queuedAheadItemsCount.value = 0; },
		removeItem(id: string) { state.notes.value = state.notes.value.filter(note => note.id !== id); },
		updateItem(id: string, updater: (item: T & MisskeyEntity) => T & MisskeyEntity) { state.notes.value = state.notes.value.map(note => note.id === id ? updater(note) : note); },
		dispose: state.dispose,
	} satisfies IPaginator<T> & { dispose: () => void };
	return paginator;
}
