/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { defineComponent, h, Suspense } from 'vue';
import Security from '@/pages/admin/security.vue';
import { i18n } from '@/i18n.js';

const { fetchMeta, saveMeta, popupMenu } = vi.hoisted(() => ({ fetchMeta: vi.fn(), saveMeta: vi.fn(), popupMenu: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: fetchMeta }));
vi.mock('@/os.js', () => ({ apiWithDialog: saveMeta, popupMenu }));
vi.mock('@/instance.js', () => ({ fetchInstance: vi.fn(), instance: { policies: {} } }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/pages/admin/bot-protection.vue', () => ({ default: { render: () => null } }));

const slots = defineComponent({ inheritAttrs: false, setup: (_props, { slots }) => () => h('div', [slots.default?.({ isParentOfTarget: true }), slots.footer?.()]) });

const saved = {
	sensitiveMediaDetection: 'none', sensitiveMediaDetectionSensitivity: 'medium',
	setSensitiveFlagAutomatically: false, enableSensitiveMediaDetectionForVideos: false,
	sensitiveMediaDetectionApiUrl: null, sensitiveMediaDetectionApiKey: null, sensitiveMediaDetectionUseProxy: null,
	sensitiveMediaDetectionTimeout: null, sensitiveMediaDetectionMaxImagesPerRequest: null,
	sensitiveMediaDetectionDefaults: { apiUrl: 'http://detector:3009', useProxy: false, timeout: 8000, maxImagesPerRequest: 2 },
	enableActiveEmailValidation: false, enableVerifymailApi: false, enableTruemailApi: false, enableIpLogging: false,
};

describe('センシティブ判定設定フォーム', () => {
	beforeEach(() => {
		fetchMeta.mockReset().mockResolvedValue(saved);
		saveMeta.mockReset().mockResolvedValue(undefined);
		popupMenu.mockReset();
	});
	afterEach(cleanup);

	async function renderSecurity() {
		const view = render({ render: () => h('div', [h(Suspense, null, { default: () => h(Security) })]) }, {
			global: {
				stubs: {
					PageWithHeader: slots, SearchMarker: slots, SearchIcon: slots, SearchLabel: slots, SearchText: slots,
					MkFolder: slots, MkRadios: true, MkSwitch: true, MkRange: true, MkTextarea: true, MkInfo: slots,
				},
				directives: { 'adaptive-border': {} },
			},
		});
		await waitFor(() => expect(view.container.querySelectorAll('input[type="number"]')).toHaveLength(2));
		return view;
	}

	async function chooseSetting(view: Awaited<ReturnType<typeof renderSecurity>>, index: number, label: string) {
		await fireEvent.mouseDown(view.getAllByText(i18n.ts._hana._sensitiveMediaDetection.useServerSetting)[index]);
		const menu = popupMenu.mock.lastCall![0] as { text: string; action: () => void }[];
		await menu.find(item => item.text === label)!.action();
	}

	test('URL だけを変更して保存しても、継承中の数値・キー・Proxy 設定は null のまま送る', async () => {
		const view = await renderSecurity();
		const inputs = [...view.container.querySelectorAll<HTMLInputElement>('input[type="number"]')];
		expect(inputs.map(input => input.value)).toEqual(['', '']);
		view.getByText(i18n.tsx._hana._sensitiveMediaDetection.serverSettingDescription({ value: '8000ms' }));
		view.getByText(i18n.tsx._hana._sensitiveMediaDetection.serverSettingDescription({ value: 2 }));

		await fireEvent.update(view.container.querySelector<HTMLInputElement>('input[type="url"]')!, 'https://custom.example');
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.save }));

		await waitFor(() => expect(saveMeta).toHaveBeenCalledWith('admin/update-meta', expect.objectContaining({
			sensitiveMediaDetectionApiUrl: 'https://custom.example', sensitiveMediaDetectionTimeout: null,
			sensitiveMediaDetectionMaxImagesPerRequest: null, sensitiveMediaDetectionApiKey: null, sensitiveMediaDetectionUseProxy: null,
		})));
	});

	test.each([
		{ name: 'タイムアウト', inputIndex: 0, field: 'sensitiveMediaDetectionTimeout', value: 7000 },
		{ name: '一括枚数', inputIndex: 1, field: 'sensitiveMediaDetectionMaxImagesPerRequest', value: 3 },
	])('保存済みの $name を入力欄から消すと null を送る', async ({ inputIndex, field, value }) => {
		fetchMeta.mockResolvedValue({ ...saved, [field]: value });
		const view = await renderSecurity();
		const input = view.container.querySelectorAll<HTMLInputElement>('input[type="number"]')[inputIndex];
		expect(input.value).toBe(String(value));

		await fireEvent.update(input, '');
		expect(input.value).toBe('');
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.save }));

		await waitFor(() => expect(saveMeta).toHaveBeenCalledWith('admin/update-meta', expect.objectContaining({ [field]: null })));
	});

	test('API キーの認証なしを選んで保存すると空文字を送る', async () => {
		const view = await renderSecurity();
		await chooseSetting(view, 0, i18n.ts._hana._sensitiveMediaDetection.noAuthentication);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.save }));
		await waitFor(() => expect(saveMeta).toHaveBeenCalledWith('admin/update-meta', expect.objectContaining({ sensitiveMediaDetectionApiKey: '' })));
	});

	test('Proxy 利用を無効にして保存すると false を送る', async () => {
		const view = await renderSecurity();
		await chooseSetting(view, 1, i18n.ts.disabled);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.save }));
		await waitFor(() => expect(saveMeta).toHaveBeenCalledWith('admin/update-meta', expect.objectContaining({ sensitiveMediaDetectionUseProxy: false })));
	});

	test('API キーの指定を選ぶと入力するまで保存できず、入力後にそのキーを送る', async () => {
		const view = await renderSecurity();
		await chooseSetting(view, 0, i18n.ts._hana._sensitiveMediaDetection.specifyApiKey);
		const save = view.getByRole('button', { name: i18n.ts.save }) as HTMLButtonElement;
		expect(save.disabled).toBe(true);
		await fireEvent.click(save);
		expect(saveMeta).not.toHaveBeenCalled();

		await fireEvent.update(view.container.querySelector<HTMLInputElement>('input[type="password"]')!, 'custom-key');
		expect(save.disabled).toBe(false);
		await fireEvent.click(save);

		await waitFor(() => expect(saveMeta).toHaveBeenCalledWith('admin/update-meta', expect.objectContaining({ sensitiveMediaDetectionApiKey: 'custom-key' })));
	});
});
