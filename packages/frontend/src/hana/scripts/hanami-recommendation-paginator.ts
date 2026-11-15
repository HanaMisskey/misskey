/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ref, shallowRef } from 'vue';
import type * as Misskey from 'misskey-js';
import type { IPaginator } from '@/utility/paginator.js';
import type { HanamiDisplayEvent } from '@/utility/hanami-impressions.js';
import { withHanamiRecommendation } from '@/utility/hanami-recommendation-context.js';
import { captureHanamiDeviceContext } from '@/utility/hanami-device-context.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { isSupportShare } from '@/utility/navigator.js';

export type HanamiRecommendationNote = Misskey.entities.Note & { recommendationEvent: HanamiDisplayEvent };

export class HanamiRecommendationPaginator implements IPaginator<HanamiRecommendationNote> {
	public items = shallowRef<HanamiRecommendationNote[]>([]);
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
	public needsRefresh = ref(false);

	private cursor: string | null = null;
	private generation = 0;
	private disposed = false;
	private aheadQueue: HanamiRecommendationNote[] = [];

	constructor(private withFiles: () => boolean) {
		this.init = this.init.bind(this);
		this.reload = this.reload.bind(this);
		this.fetchOlder = this.fetchOlder.bind(this);
	}

	public init(): Promise<void> {
		return this.start(false);
	}

	public reload(): Promise<void> {
		return this.start(true);
	}

	private async start(refresh: boolean): Promise<void> {
		if (this.disposed) return;
		this.generation++;
		this.clearItems();
		this.fetchingOlder.value = false;
		this.fetchOlderError.value = false;
		this.needsRefresh.value = false;
		await this.fetchPage(true, refresh);
	}

	public async fetchOlder(): Promise<void> {
		if (this.disposed || this.fetching.value || this.fetchingOlder.value || !this.canFetchOlder.value) return;
		await this.fetchPage(false);
	}

	private async fetchPage(initial: boolean, refresh = false): Promise<void> {
		const generation = this.generation;
		const loading = initial ? this.fetching : this.fetchingOlder;
		const error = initial ? this.error : this.fetchOlderError;
		loading.value = true;
		error.value = false;
		try {
			const page = await misskeyApi('notes/hanami-recommendations', {
				limit: 20,
				utcOffsetMinutes: -new Date().getTimezoneOffset(),
				deviceContext: captureHanamiDeviceContext(),
				withFiles: this.withFiles(),
				...(this.cursor == null ? { refresh, clientCapabilities: { nativeShare: isSupportShare() } } : { cursor: this.cursor }),
			});
			if (this.disposed || generation !== this.generation) return;
			this.pushItems(page.items.map(item => withHanamiRecommendation(item.note, {
				eventId: crypto.randomUUID(), snapshotId: page.snapshotId, entryId: item.entryId, noteId: item.note.id,
			})));
			this.cursor = page.nextCursor;
			this.canFetchOlder.value = page.nextCursor != null;
		} catch (cause) {
			if (this.disposed || generation !== this.generation) return;
			error.value = true;
			if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'REFRESH_REQUIRED') {
				this.clearItems();
				this.error.value = true;
			}
		} finally {
			if (!this.disposed && generation === this.generation) loading.value = false;
		}
	}

	private clearItems(): void {
		this.items.value = [];
		this.aheadQueue = [];
		this.queuedAheadItemsCount.value = 0;
		this.cursor = null;
		this.canFetchOlder.value = false;
	}

	public requireRefresh(): void {
		this.generation++;
		this.cursor = null;
		this.canFetchOlder.value = false;
		this.fetching.value = false;
		this.fetchingOlder.value = false;
		this.needsRefresh.value = true;
	}

	public async fetchNewer(): Promise<void> {
		// 推薦snapshotのcursorは逆方向の取得や順位変更には使えない。
	}

	public trim(): void {
		// 切り捨てた推薦を後続cursorから取り戻すことはできない。
	}

	public unshiftItems(items: HanamiRecommendationNote[]): void {
		this.items.value = [...items, ...this.items.value];
	}

	public pushItems(items: HanamiRecommendationNote[]): void {
		this.items.value = [...this.items.value, ...items];
	}

	public prepend(item: HanamiRecommendationNote): void {
		this.unshiftItems([item]);
	}

	public enqueue(item: HanamiRecommendationNote): void {
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

	public updateItem(id: string, updater: (item: HanamiRecommendationNote) => HanamiRecommendationNote): void {
		this.items.value = this.items.value.map(item => item.id === id ? updater(item) : item);
	}

	public dispose(): void {
		this.disposed = true;
		this.generation++;
	}
}
