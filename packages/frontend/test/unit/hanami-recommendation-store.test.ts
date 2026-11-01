import { afterEach, describe, expect, test, vi } from 'vitest';
const { values, account } = vi.hoisted(() => ({ values: new Map<string, unknown>(), account: { id: 'alice' } }));
vi.mock('@/i.js', () => ({ $i: account }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: async () => ({}) }));
vi.mock('@/utility/idb-proxy.js', () => ({ get: async (key: string) => values.get(key), set: async (key: string, value: unknown) => { values.set(key, structuredClone(value)); } }));
vi.mock('broadcast-channel', () => ({ BroadcastChannel: class { addEventListener() {} postMessage() {} } }));
vi.mock('@/utility/device-kind.js', () => ({ DEFAULT_DEVICE_KIND: 'desktop' }));
vi.mock('@/local-storage.js', () => ({ miLocalStorage: { getItem: () => null } }));
afterEach(() => { values.clear(); account.id = 'alice'; vi.resetModules(); });

/** Oracle: recommendation file preference is device-account scoped, initially false, persistent, and must not overwrite normal timeline filters. Real store/Pizzax execute against an in-memory IndexedDB boundary; this is not a browser persistence test. */
describe('recommendation file preference storage', () => {
	test('saves the independent condition for this account and restores it after reloading the store', async () => {
		values.set('pizzax::base::alice', { hanamiRecommendationImageFilter: 'with_image' });
		const { store } = await import('@/store.js');
		await store.loaded;
		const recommendationStore = store as unknown as {
			def: { hanamiRecommendationWithFiles: { where: string; default: boolean } };
			s: { hanamiRecommendationWithFiles: boolean };
			set: (key: 'hanamiRecommendationWithFiles', value: boolean) => Promise<void>;
		};
		expect(recommendationStore.def.hanamiRecommendationWithFiles).toEqual({ where: 'deviceAccount', default: false });
		expect(recommendationStore.s.hanamiRecommendationWithFiles).toBe(false);
		expect(store.def).not.toHaveProperty('hanamiRecommendationImageFilter');
		const normal = structuredClone(store.s.tl);
		await recommendationStore.set('hanamiRecommendationWithFiles', true);
		expect(values.get('pizzax::base::alice')).toMatchObject({ hanamiRecommendationWithFiles: true });
		expect(store.s.tl).toEqual(normal);
		vi.resetModules();
		const restored = (await import('@/store.js')).store;
		await restored.loaded;
		expect((restored.s as unknown as { hanamiRecommendationWithFiles: boolean }).hanamiRecommendationWithFiles).toBe(true);
		account.id = 'bob';
		vi.resetModules();
		const other = (await import('@/store.js')).store;
		await other.loaded;
		expect((other.s as unknown as { hanamiRecommendationWithFiles: boolean }).hanamiRecommendationWithFiles).toBe(false);
	});
});
