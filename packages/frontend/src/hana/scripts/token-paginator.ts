/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ref } from 'vue';
import type { Ref } from 'vue';
import type * as Misskey from 'misskey-js';
import type { IPaginator, MisskeyEntity } from '@/utility/paginator.js';
import { misskeyApi } from '@/utility/misskey-api.js';

export type TokenPaginatorCompatibleEndpointPaths = {
	[K in keyof Misskey.Endpoints]: Misskey.Endpoints[K]['res'] extends { notes: MisskeyEntity[]; nextCursor: string | null } ? K : never;
}[keyof Misskey.Endpoints];

type TokenItem<Endpoint extends TokenPaginatorCompatibleEndpointPaths> = Misskey.Endpoints[Endpoint]['res']['notes'][number] & MisskeyEntity;

/** Forward-only pagination. Preserve the server's ranking and use only its cursor to continue. */
export class TokenPaginator<
	Endpoint extends TokenPaginatorCompatibleEndpointPaths,
> implements IPaginator<TokenItem<Endpoint>> {
	public items = ref<TokenItem<Endpoint>[]>([]) as Ref<TokenItem<Endpoint>[]>;
	public queuedAheadItemsCount = ref(0);
	public fetching = ref(true);
	public fetchingOlder = ref(false);
	public fetchingNewer = ref(false);
	public canFetchOlder = ref(false);
	public canFetchNewer = ref(false);
	public canSearch = false;
	public error = ref(false);
	public fetchOlderError = ref(false);
	public computedParams = null;
	public initialId = null;
	public initialDate = null;
	public initialDirection = 'older' as const;
	public noPaging = false;
	public searchQuery = ref<string | null>(null);
	public order = ref<'newest' | 'oldest'>('newest');

	private readonly params: Misskey.Endpoints[Endpoint]['req'];
	private nextCursor: string | null = null;
	private aheadQueue: TokenItem<Endpoint>[] = [];
	private generation = 0;
	private disposed = false;

	constructor(private endpoint: Endpoint, props: {
		params: Omit<Misskey.Endpoints[Endpoint]['req'], 'cursor' | 'limit'>;
		limit?: number;
	}) {
		// Capture submitted conditions; editing the form cannot change a continuation.
		this.params = { ...props.params, limit: props.limit ?? 10 } as Misskey.Endpoints[Endpoint]['req'];
		this.init = this.init.bind(this);
		this.reload = this.reload.bind(this);
		this.fetchOlder = this.fetchOlder.bind(this);
		this.fetchNewer = this.fetchNewer.bind(this);
		this.dispose = this.dispose.bind(this);
		this.unshiftItems = this.unshiftItems.bind(this);
		this.pushItems = this.pushItems.bind(this);
		this.prepend = this.prepend.bind(this);
		this.enqueue = this.enqueue.bind(this);
		this.releaseQueue = this.releaseQueue.bind(this);
		this.removeItem = this.removeItem.bind(this);
		this.updateItem = this.updateItem.bind(this);
		this.trim = this.trim.bind(this);
	}

	public async init(): Promise<void> {
		if (this.disposed) return;
		this.generation++;
		this.items.value = [];
		this.aheadQueue = [];
		this.queuedAheadItemsCount.value = 0;
		this.nextCursor = null;
		this.canFetchOlder.value = false;
		this.fetchingOlder.value = false;
		this.fetchOlderError.value = false;
		await this.fetchPage(true);
	}

	public reload(): Promise<void> {
		return this.init();
	}

	public async fetchOlder(): Promise<void> {
		if (this.disposed || this.fetching.value || this.fetchingOlder.value || !this.canFetchOlder.value) return;
		await this.fetchPage(false);
	}

	private async fetchPage(initial: boolean): Promise<void> {
		const generation = this.generation;
		const loading = initial ? this.fetching : this.fetchingOlder;
		const error = initial ? this.error : this.fetchOlderError;
		loading.value = true;
		error.value = false;
		try {
			const page = await misskeyApi(this.endpoint, {
				...this.params,
				...(this.nextCursor == null ? {} : { cursor: this.nextCursor }),
			}) as Misskey.Endpoints[Endpoint]['res'];
			if (generation !== this.generation) return;
			const notes = page.notes as TokenItem<Endpoint>[];
			// Match the common paginator's ad placement without sorting by note ID.
			if (notes[initial ? 3 : 10]) notes[initial ? 3 : 10]._shouldInsertAd_ = true;
			this.pushItems(notes);
			this.nextCursor = page.nextCursor;
			this.canFetchOlder.value = page.nextCursor != null;
		} catch {
			if (generation === this.generation) error.value = true;
		} finally {
			if (generation === this.generation) loading.value = false;
		}
	}

	public async fetchNewer(): Promise<void> {
		// A cursor cannot page backwards or change search ranking.
	}

	public trim(): void {
		// Truncated results cannot be recovered using the next forward-only cursor.
	}

	public unshiftItems(items: TokenItem<Endpoint>[]): void {
		const ids = new Set(this.items.value.map(item => item.id));
		this.items.value = [...items.filter(item => {
			if (ids.has(item.id)) return false;
			ids.add(item.id);
			return true;
		}), ...this.items.value];
	}

	public pushItems(items: TokenItem<Endpoint>[]): void {
		const ids = new Set(this.items.value.map(item => item.id));
		this.items.value.push(...items.filter(item => {
			if (ids.has(item.id)) return false;
			ids.add(item.id);
			return true;
		}));
	}

	public prepend(item: TokenItem<Endpoint>): void {
		this.unshiftItems([item]);
	}

	public enqueue(item: TokenItem<Endpoint>): void {
		if (this.aheadQueue.some(queued => queued.id === item.id)) return;
		this.aheadQueue.unshift(item);
		this.queuedAheadItemsCount.value = this.aheadQueue.length;
	}

	public releaseQueue(): void {
		this.unshiftItems(this.aheadQueue.splice(0));
		this.queuedAheadItemsCount.value = 0;
	}

	public removeItem(id: string): void {
		this.items.value = this.items.value.filter(item => item.id !== id);
		this.aheadQueue = this.aheadQueue.filter(item => item.id !== id);
		this.queuedAheadItemsCount.value = this.aheadQueue.length;
	}

	public updateItem(id: string, updater: (item: TokenItem<Endpoint>) => TokenItem<Endpoint>): void {
		this.items.value = this.items.value.map(item => item.id === id ? updater(item) : item);
	}

	public dispose(): void {
		this.disposed = true;
		this.generation++;
		this.fetching.value = false;
		this.fetchingOlder.value = false;
	}
}
