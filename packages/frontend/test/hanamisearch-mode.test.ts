/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import Picker from '@/components/HanaSearchModePicker.vue';
import SearchInput from '@/components/HanaSearchInput.vue';

const { policies } = vi.hoisted(() => ({ policies: { canSearchWithHanamiSearchV1: true, canSearchWithHanamiSearchV2: false } }));
vi.mock('@/i.js', () => ({ $i: { policies }, ensureSignin: () => ({ policies }) }));
vi.mock('@/os.js', () => ({ popup: vi.fn() }));
vi.mock('@@/js/use-interval.js', () => ({ useInterval: vi.fn() }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { search: 'Search', _hana: { _searchMode: { title: 'Mode', v0Description: '', v1Description: 'Previous search description' } } } } }));
vi.mock('@/components/MkModal.vue', () => ({ default: { methods: { close() {} }, template: '<div><slot type="popup" /></div>' } }));

afterEach(() => { cleanup(); policies.canSearchWithHanamiSearchV1 = true; policies.canSearchWithHanamiSearchV2 = false; });

/** Oracle: the selectable versions are HanamiSearch v1 and v2, each requiring its own permission. */
describe('HanamiSearch mode choices', () => {
	test('offers only v1 when v2 is not permitted', () => {
		const view = render(Picker, { props: { currentMode: 'v1' }, global: { stubs: ['MkCondensedLine'] } });
		expect(view.queryByText('HanamiSearch v2 β')).toBeNull();
		expect(view.getByText('HanamiSearch v1')).toBeTruthy();
		expect(view.queryByText('Search (v0)')).toBeNull();
		expect(view.getAllByRole('button')).toHaveLength(1);
	});

	test('allows v2 without requiring v1 permission', async () => {
		policies.canSearchWithHanamiSearchV1 = false;
		policies.canSearchWithHanamiSearchV2 = true;
		const view = render(Picker, { props: { currentMode: 'v0' }, global: { stubs: ['MkCondensedLine'] } });
		expect(view.queryByText('HanamiSearch v1')).toBeNull();
		await fireEvent.click(view.getByText('HanamiSearch v2 β'));
		expect(view.emitted().changeMode).toEqual([['v2']]);
		expect(view.getAllByRole('button')).toHaveLength(1);
	});

	test('offers exactly v1 and v2 when both are permitted', () => {
		policies.canSearchWithHanamiSearchV2 = true;
		const view = render(Picker, { props: { currentMode: 'v2' }, global: { stubs: { MkCondensedLine: { template: '<span><slot /></span>' } } } });
		expect(view.getAllByRole('button').map(button => button.textContent?.trim())).toEqual(['HanamiSearch v1', 'HanamiSearch v2 β']);
		expect(view.queryByText('Previous search description')).toBeNull();
	});
});

/** Oracle: the agreed UI uses a blank v1 menu icon slot and ti-sparkles for v2; menu labels retain v2 β. */
test('leaves the v1 menu icon slot empty and marks v2 with sparkles', () => {
	policies.canSearchWithHanamiSearchV2 = true;
	const view = render(Picker, { props: { currentMode: 'v1' } });
	const v1 = view.getByRole('button', { name: 'HanamiSearch v1' });
	const v2 = view.getByRole('button', { name: 'HanamiSearch v2 β' });
	const v1Slot = v1.firstElementChild;
	const v2Slot = v2.firstElementChild;
	expect(v1Slot).not.toBeNull();
	expect(v1Slot?.textContent).toBe('');
	expect(v1Slot?.children).toHaveLength(0);
	expect(v1Slot?.className).toBe(v2Slot?.className);
	expect(v2Slot?.querySelector('.ti.ti-sparkles')).not.toBeNull();
});

/** Oracle: the input suffix displays plain v1 without a mode icon, or sparkles plus v2 without β. */
describe('HanamiSearch input mode display', () => {
	test.each(['v1', 'v2'] as const)('shows %s with its agreed icon and no beta suffix', (mode) => {
		policies.canSearchWithHanamiSearchV2 = true;
		const view = render(SearchInput, { props: { modelValue: '', mode } });
		const button = view.getByRole('button', { name: mode });
		expect(button.querySelectorAll('.ti-sparkles')).toHaveLength(mode === 'v2' ? 1 : 0);
		expect(button.querySelectorAll('.ti')).toHaveLength(mode === 'v2' ? 2 : 1);
		expect(button.querySelector('.ti-chevron-down')).not.toBeNull();
	});
});
