/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ref, shallowRef } from 'vue';

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
	let hasPage = false;

	async function loadMore(): Promise<void> {
		if (disposed || params == null || loading.value || (hasPage && nextCursor.value == null)) return;
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
			hasPage = true;
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
		hasPage = false;
		loading.value = false;
		error.value = false;
		await loadMore();
	}

	function dispose(): void {
		disposed = true;
		generation++;
		loading.value = false;
	}

	return { notes, nextCursor, loading, error, search, loadMore, dispose };
}
