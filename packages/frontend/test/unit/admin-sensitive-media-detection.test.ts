/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { defineComponent, h, Suspense, type PropType } from 'vue';
import Security from '@/pages/admin/security.vue';

const { fetchMeta, saveMeta } = vi.hoisted(() => ({ fetchMeta: vi.fn(), saveMeta: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: fetchMeta }));
vi.mock('@/os.js', () => ({ apiWithDialog: saveMeta }));
vi.mock('@/instance.js', () => ({ fetchInstance: vi.fn(), instance: { policies: {} } }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/pages/admin/bot-protection.vue', () => ({ default: { render: () => null } }));

const slots = defineComponent({ inheritAttrs: false, setup: (_props, { slots }) => () => h('div', [slots.default?.({ isParentOfTarget: true }), slots.footer?.()]) });
const footer = defineComponent({
	props: ['form', 'canSaving'],
	setup: props => () => h('button', { disabled: props.canSaving === false, onClick: () => props.form.save() }, 'save detector'),
});
const select = defineComponent({
	props: { modelValue: String, items: { type: Array as PropType<{ value: string; label: string }[]>, required: true } },
	emits: ['update:modelValue'],
	setup: (props, { emit }) => () => h('select', {
		value: props.modelValue,
		onChange: (event: Event) => emit('update:modelValue', (event.target as HTMLSelectElement).value),
	}, props.items.map(item => h('option', { value: item.value }, item.label))),
});

/**
 * Oracle: 管理画面は raw DB 値を編集し、サーバー既定値は caption にだけ表示する。
 * 未変更の null は保存しても継承のまま。数値を消したときも null を送る。
 * 実際の MkInput と useForm を使い、空の number input から保存リクエストまで検証する。
 */
describe('センシティブ判定設定フォーム', () => {
	beforeEach(() => {
		fetchMeta.mockResolvedValue({
			sensitiveMediaDetection: 'none', sensitiveMediaDetectionSensitivity: 'medium',
			setSensitiveFlagAutomatically: false, enableSensitiveMediaDetectionForVideos: false,
			sensitiveMediaDetectionApiUrl: null, sensitiveMediaDetectionApiKey: null, sensitiveMediaDetectionUseProxy: null,
			sensitiveMediaDetectionTimeout: null, sensitiveMediaDetectionMaxImagesPerRequest: null,
			sensitiveMediaDetectionDefaults: { apiUrl: 'http://detector:3009', useProxy: false, timeout: 8000, maxImagesPerRequest: 2 },
			enableActiveEmailValidation: false, enableVerifymailApi: false, enableTruemailApi: false, enableIpLogging: false,
		});
		saveMeta.mockReset().mockResolvedValue(undefined);
	});
	afterEach(cleanup);

	async function renderSecurity() {
		const view = render({ render: () => h('div', [h(Suspense, null, { default: () => h(Security) })]) }, {
			global: {
				stubs: {
					PageWithHeader: slots, SearchMarker: slots, SearchIcon: slots, SearchLabel: slots, SearchText: slots,
					MkFolder: slots, MkFormFooter: footer, MkSelect: select, MkRadios: true, MkSwitch: true, MkRange: true, MkTextarea: true, MkInfo: slots,
				},
				directives: { 'adaptive-border': {} },
			},
		});
		await waitFor(() => expect(view.container.querySelectorAll('input[type="number"]')).toHaveLength(2));
		return view;
	}

	test('別の接続項目を編集しても継承中の数値やキーを DB に固定しない', async () => {
		const view = await renderSecurity();
		const inputs = [...view.container.querySelectorAll<HTMLInputElement>('input[type="number"]')];
		expect(inputs.map(input => input.value)).toEqual(['', '']);
		await fireEvent.update(view.container.querySelector<HTMLInputElement>('input[type="url"]')!, 'https://custom.example');
		await fireEvent.click(await view.findByText('save detector'));
		await waitFor(() => expect(saveMeta).toHaveBeenCalledWith('admin/update-meta', expect.objectContaining({
			sensitiveMediaDetectionApiUrl: 'https://custom.example', sensitiveMediaDetectionTimeout: null,
			sensitiveMediaDetectionMaxImagesPerRequest: null, sensitiveMediaDetectionApiKey: null, sensitiveMediaDetectionUseProxy: null,
		})));
	});

	test.each([
		{ name: 'タイムアウト', inputIndex: 0, field: 'sensitiveMediaDetectionTimeout' },
		{ name: '一括枚数', inputIndex: 1, field: 'sensitiveMediaDetectionMaxImagesPerRequest' },
	])('説明のサーバー値を入力欄へ代入せず、$name を消すと継承へ戻す', async ({ inputIndex, field }) => {
		const view = await renderSecurity();
		const input = view.container.querySelectorAll<HTMLInputElement>('input[type="number"]')[inputIndex];
		expect(input.value).toBe('');
		expect(view.container.textContent).toContain('8000');
		await fireEvent.update(input, '7000');
		await fireEvent.update(input, '');
		expect(input.value).toBe('');
		await fireEvent.update(view.container.querySelector<HTMLInputElement>('input[type="url"]')!, 'https://custom.example');
		await fireEvent.click(await view.findByText('save detector'));
		await waitFor(() => expect(saveMeta).toHaveBeenCalledWith('admin/update-meta', expect.objectContaining({ [field]: null })));
	});

	test('認証なしと Proxy 不使用を選ぶと空キーと false を明示保存する', async () => {
		const view = await renderSecurity();
		const selects = [...view.container.querySelectorAll('select')];
		const keyMode = selects.find(element => [...element.options].some(option => option.value === 'none'));
		const proxyMode = selects.find(element => [...element.options].some(option => option.value === 'off'));
		expect(keyMode).toBeDefined();
		expect(proxyMode).toBeDefined();
		await fireEvent.update(keyMode!, 'none');
		await fireEvent.update(proxyMode!, 'off');
		await fireEvent.click(await view.findByText('save detector'));
		await waitFor(() => expect(saveMeta).toHaveBeenCalledWith('admin/update-meta', expect.objectContaining({
			sensitiveMediaDetectionApiKey: '', sensitiveMediaDetectionUseProxy: false,
		})));
	});

	test('キーを指定するモードの入力不足では保存せず、入力すると保存できる', async () => {
		const view = await renderSecurity();
		const keyMode = [...view.container.querySelectorAll('select')].find(element => [...element.options].some(option => option.value === 'custom'));
		expect(keyMode).toBeDefined();
		await fireEvent.update(keyMode!, 'custom');
		const save = await view.findByText('save detector') as HTMLButtonElement;
		expect(save.disabled).toBe(true);
		await fireEvent.update(view.container.querySelector<HTMLInputElement>('input[type="password"]')!, 'custom-key');
		expect(save.disabled).toBe(false);
		await fireEvent.click(save);
		await waitFor(() => expect(saveMeta).toHaveBeenCalledWith('admin/update-meta', expect.objectContaining({ sensitiveMediaDetectionApiKey: 'custom-key' })));
	});
});
