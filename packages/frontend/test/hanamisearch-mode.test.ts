/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import Picker from '@/components/HanaSearchModePicker.vue';

const { policies } = vi.hoisted(() => ({ policies: { canSearchWithHanamiSearchV1: true, canSearchWithHanamiSearchV2: false } }));
vi.mock('@/i.js', () => ({ ensureSignin: () => ({ policies }) }));
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
