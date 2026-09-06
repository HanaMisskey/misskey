/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import Picker from '@/components/HanaSearchModePicker.vue';
import SearchInput from '@/components/HanaSearchInput.vue';

const { state } = vi.hoisted(() => ({ state: { user: null as null | { policies: { canSearchWithHanamiSearchV1: boolean; canSearchWithHanamiSearchV2: boolean } } } }));
vi.mock('@/i.js', () => ({ get $i() { return state.user; } }));
vi.mock('@/os.js', () => ({ popup: vi.fn() }));
vi.mock('@@/js/use-interval.js', () => ({ useInterval: vi.fn() }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { search: 'Search', _hana: { _searchMode: { title: 'Mode', v1Description: 'Operators', v2Description: 'Operators and synonyms' } } } } }));
vi.mock('@/components/MkModal.vue', () => ({ default: { methods: { close() {} }, template: '<div><slot type="popup" /></div>' } }));
afterEach(() => { cleanup(); state.user = null; });

const global = { stubs: { MkCondensedLine: { template: '<span><slot /></span>' } } };
describe('search modes restored from #365', () => {
	test.each([[false, false], [true, false], [false, true], [true, true]])('shows both modes and enforces v1=%s v2=%s', async (v1, v2) => {
		state.user = { policies: { canSearchWithHanamiSearchV1: v1, canSearchWithHanamiSearchV2: v2 } };
		const view = render(Picker, { props: { currentMode: 'v1' }, global });
		const first = view.getByRole('button', { name: 'HanamiSearch v1 Operators' }) as HTMLButtonElement;
		const second = view.getByRole('button', { name: 'HanamiSearch v2 Operators and synonyms' }) as HTMLButtonElement;
		expect(first.disabled).toBe(!v1);
		expect(second.disabled).toBe(!v2);
		expect(first.querySelector('.ti-filter-search')).not.toBeNull();
		expect(second.querySelector('.ti-message-2-search')).not.toBeNull();
		expect(view.queryByText(/β/)).toBeNull();
		await fireEvent.click(first);
		await fireEvent.click(second);
		expect(view.emitted().changeMode ?? []).toEqual([...(v1 ? [['v1']] : []), ...(v2 ? [['v2']] : [])]);
	});

	test('renders a disabled picker and input for guests', () => {
		const picker = render(Picker, { props: { currentMode: 'v1' }, global });
		expect(picker.getAllByRole('button').every(button => (button as HTMLButtonElement).disabled)).toBe(true);
		picker.unmount();
		const input = render(SearchInput, { props: { modelValue: '', mode: 'v1' } });
		expect((input.getByRole('button', { name: 'v1' }) as HTMLButtonElement).disabled).toBe(true);
	});

	test.each(['v1', 'v2'] as const)('restores the input icon and v2-only accent in %s', mode => {
		state.user = { policies: { canSearchWithHanamiSearchV1: true, canSearchWithHanamiSearchV2: true } };
		const view = render(SearchInput, { props: { modelValue: '', mode } });
		const button = view.getByRole('button', { name: mode });
		expect(button.querySelector('.ti-sparkles')).not.toBeNull();
		expect(button.querySelector('.ti-chevron-down')).not.toBeNull();
		expect(button.className.includes('accented')).toBe(mode === 'v2');
	});

	test.each(['v1', 'v2'] as const)('highlights operators in %s and tolerates incomplete input', async mode => {
		const view = render(SearchInput, { props: { modelValue: "花 OR 空 -雨 '青い 空'", mode } });
		expect(view.container.querySelector('[class*=orOperator]')?.textContent).toBe('OR');
		expect(view.container.querySelector('[class*=notOperator]')?.textContent).toBe('-');
		expect(view.container.querySelector('[class*=exactMatch]')?.textContent).toBe("'青い 空'");
		for (const text of ['OR', "'青い", '-雨 OR 空', '花 OR OR', "'"]) {
			await fireEvent.update(view.getByRole('textbox'), text);
			expect((view.getByRole('textbox') as HTMLInputElement).value).toBe(text);
		}
	});
});
