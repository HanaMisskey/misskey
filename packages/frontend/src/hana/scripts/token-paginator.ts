import { ref, shallowRef, triggerRef } from 'vue';
import * as Misskey from 'misskey-js';
import type { IPaginator, MisskeyEntity } from '@/utility/paginator.js';
import { paginatorConsts } from '@/utility/paginator.js';
import type { ComputedRef, Ref, ShallowRef } from 'vue';
import { misskeyApi } from '@/utility/misskey-api.js';

const {
	MAX_ITEMS,
	MAX_QUEUE_ITEMS,
	FIRST_FETCH_LIMIT,
	SECOND_FETCH_LIMIT,
} = paginatorConsts;

type AbsEndpointType = {
	req: unknown;
	res: unknown;
};

type FilterByEpRes<E extends Record<string, AbsEndpointType>> = {
	[K in keyof E]: E[K]['res'] extends { items: Array<{ id: string }>, nextToken?: string | null } ? K : never
}[keyof E];
export type TokenPaginatorCompatibleEndpointPaths = FilterByEpRes<Misskey.Endpoints>;
export type TokenPaginatorCompatibleEndpoints = {
	[K in TokenPaginatorCompatibleEndpointPaths]: Misskey.Endpoints[K];
};

type TokenizedResponse<T extends { id: string }> = {
	items: T[];
	nextToken?: string;
};

/**
 * nextToken を使ってページングする paginator。
 * - fetchOlder(): nextToken を使って次ページ（より古い/後続）を取得
 * - fetchNewer(): token だけでは一般に巻き戻せないため no-op
 */
export class TokenPaginator<
	Endpoint extends TokenPaginatorCompatibleEndpointPaths,
	E extends TokenPaginatorCompatibleEndpoints[Endpoint],
	Req extends E['req'],
	Res extends E['res'] & TokenizedResponse<{ id: string }>,
	T extends Res['items'][number] & MisskeyEntity,
	SRef extends boolean = false,
> implements IPaginator<T> {
	/**
	 * 外部から直接操作しないでください
	 */
	public items: SRef extends true ? ShallowRef<T[]> : Ref<T[]>;

	public queuedAheadItemsCount = ref(0);
	public fetching = ref(true);
	public fetchingOlder = ref(false);
	public fetchingNewer = ref(false);
	public canFetchOlder = ref(false);
	public canFetchNewer = ref(false);
	public canSearch = false;
	public error = ref(false);

	private endpoint: Endpoint;
	private limit: number;
	private params: Req | (() => Req);
	public computedParams: ComputedRef<Req | null | undefined> | null;
	public initialId: MisskeyEntity['id'] | null = null;
	public initialDate: number | null = null;
	public initialDirection: 'newer' | 'older' = 'older';
	public noPaging: boolean;
	public searchQuery = ref<null | string>('');
	public order: Ref<'newest' | 'oldest'>;

	private searchParamName: keyof Req | 'search';
	private nextToken: string | null = null;
	private aheadQueue: T[] = [];
	private useShallowRef: SRef;

	constructor(endpoint: Endpoint, props: {
		limit?: number;
		params?: Req | (() => Req);
		computedParams?: ComputedRef<Req | null | undefined>;
		noPaging?: boolean;
		order?: 'newest' | 'oldest';
		useShallowRef?: SRef;
		canSearch?: boolean;
		searchParamName?: keyof Req;
	}) {
		this.endpoint = endpoint;
		this.useShallowRef = (props.useShallowRef ?? false) as SRef;
		if (this.useShallowRef) {
			this.items = shallowRef<T[]>([]);
		} else {
			this.items = ref<T[]>([]) as Ref<T[]>;
		}

		this.limit = props.limit ?? FIRST_FETCH_LIMIT;
		this.params = props.params ?? ({} as Req);
		this.computedParams = props.computedParams ?? null;
		this.noPaging = props.noPaging ?? false;
		this.order = ref(props.order ?? 'newest');
		this.canSearch = props.canSearch ?? false;
		this.searchParamName = props.searchParamName ?? 'search';

		this.init = this.init.bind(this);
		this.reload = this.reload.bind(this);
		this.fetchOlder = this.fetchOlder.bind(this);
		this.fetchNewer = this.fetchNewer.bind(this);
		this.unshiftItems = this.unshiftItems.bind(this);
		this.pushItems = this.pushItems.bind(this);
		this.prepend = this.prepend.bind(this);
		this.enqueue = this.enqueue.bind(this);
		this.releaseQueue = this.releaseQueue.bind(this);
		this.removeItem = this.removeItem.bind(this);
		this.updateItem = this.updateItem.bind(this);
		this.trim = this.trim.bind(this);
	}

	private applyAdMarker(items: T[], index: number): void {
		const item = items[index];
		if (item) item._shouldInsertAd_ = true;
	}

	public async init(): Promise<void> {
		this.items.value = [];
		this.aheadQueue = [];
		this.queuedAheadItemsCount.value = 0;
		this.fetching.value = true;
		this.error.value = false;
		this.nextToken = null;
		this.canFetchNewer.value = false;
		this.canFetchOlder.value = false;

		const data: Req = {
			...(typeof this.params === 'function' ? this.params() : this.params),
			...(this.computedParams ? this.computedParams.value : {}),
			...(this.searchQuery.value != null && this.searchQuery.value.trim() !== '' ? { [this.searchParamName]: this.searchQuery.value } : {}),
			limit: (this.limit ?? FIRST_FETCH_LIMIT),
			allowPartial: true,
		};

		const apiRes = (await misskeyApi(this.endpoint, data).catch(() => {
			this.error.value = true;
			this.fetching.value = false;
			return null;
		})) as Res | null;

		if (apiRes == null) return;

		const items = (apiRes.items ?? []) as T[];
		this.applyAdMarker(items, 3);

		if (this.order.value === 'oldest') {
			this.pushItems(items.toReversed());
		} else {
			this.pushItems(items);
		}

		this.nextToken = apiRes.nextToken ?? null;
		this.canFetchOlder.value = !this.noPaging && this.nextToken != null && items.length > 0;
		this.fetching.value = false;
	}

	public reload(): Promise<void> {
		return this.init();
	}

	public async fetchOlder(): Promise<void> {
		if (this.noPaging) return;
		if (!this.canFetchOlder.value || this.fetching.value || this.fetchingOlder.value || this.items.value.length === 0) return;
		if (this.nextToken == null) {
			this.canFetchOlder.value = false;
			return;
		}
		this.fetchingOlder.value = true;

		const data: Req = {
			...(typeof this.params === 'function' ? this.params() : this.params),
			...(this.computedParams ? this.computedParams.value : {}),
			...(this.searchQuery.value != null && this.searchQuery.value.trim() !== '' ? { [this.searchParamName]: this.searchQuery.value } : {}),
			limit: SECOND_FETCH_LIMIT,
			nextToken: this.nextToken,
		};

		const apiRes = (await misskeyApi(this.endpoint, data).catch(() => {
			return null;
		})) as Res | null;

		this.fetchingOlder.value = false;
		if (apiRes == null) return;

		const items = (apiRes.items ?? []) as T[];
		this.applyAdMarker(items, 10);

		if (this.order.value === 'oldest') {
			this.unshiftItems(items.toReversed(), false);
		} else {
			this.pushItems(items);
		}

		this.nextToken = apiRes.nextToken ?? null;
		this.canFetchOlder.value = this.nextToken != null && items.length > 0;
	}

	public async fetchNewer(_options: { toQueue?: boolean } = {}): Promise<void> {
		// token 方式では基本的に前へ進むことしかできないため no-op
		if (_DEV_) console.warn('TokenPaginator: fetchNewer is not supported');
		this.canFetchNewer.value = false;
		return;
	}

	public trim(trigger = true): void {
		if (this.items.value.length >= MAX_ITEMS) this.canFetchOlder.value = true;
		this.items.value = this.items.value.slice(0, MAX_ITEMS);
		if (this.useShallowRef && trigger) triggerRef(this.items);
	}

	public unshiftItems(newItems: T[], trim = true): void {
		if (newItems.length === 0) return;
		this.items.value.unshift(...newItems.filter(x => !this.items.value.some(y => y.id === x.id)));
		if (trim) this.trim(true);
		if (this.useShallowRef) triggerRef(this.items);
	}

	public pushItems(oldItems: T[]): void {
		if (oldItems.length === 0) return;
		this.items.value.push(...oldItems);
		if (this.useShallowRef) triggerRef(this.items);
	}

	public prepend(item: T): void {
		if (this.items.value.some(x => x.id === item.id)) return;
		this.items.value.unshift(item);
		this.trim(false);
		if (this.useShallowRef) triggerRef(this.items);
	}

	public enqueue(item: T): void {
		this.aheadQueue.unshift(item);
		if (this.aheadQueue.length > MAX_QUEUE_ITEMS) {
			this.aheadQueue.pop();
		}
		this.queuedAheadItemsCount.value = this.aheadQueue.length;
	}

	public releaseQueue(): void {
		if (this.aheadQueue.length === 0) return;
		this.unshiftItems(this.aheadQueue);
		this.aheadQueue = [];
		this.queuedAheadItemsCount.value = 0;
	}

	public removeItem(id: string): void {
		const index = this.items.value.findIndex(x => x.id === id);
		if (index !== -1) {
			this.items.value.splice(index, 1);
			if (this.useShallowRef) triggerRef(this.items);
		}
	}

	public updateItem(id: string, updater: (item: T) => T): void {
		const index = this.items.value.findIndex(x => x.id === id);
		if (index !== -1) {
			const item = this.items.value[index]!;
			this.items.value[index] = updater(item);
			if (this.useShallowRef) triggerRef(this.items);
		}
	}
}
