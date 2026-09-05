/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';

const { state } = vi.hoisted(() => ({ state: {
	user: null as null | { policies: { canSearchNotes: boolean; canSearchWithHanamiSearchV1: boolean; canSearchWithHanamiSearchV2: boolean } },
	instance: { policies: { canSearchNotes: false, canSearchUsers: false, canSearchWithHanamiSearchV2: true }, noteSearchableScope: 'global' },
} }));
vi.mock('@/i.js', () => ({ get $i() { return state.user; } }));
vi.mock('@/instance.js', () => ({ instance: state.instance }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { notesSearchNotAvailable: 'Search unavailable' } } }));
vi.mock('@/components/MkInfo.vue', () => ({ default: { template: '<p><slot /></p>' } }));
vi.mock('@/pages/search.note.hana.vue', () => ({ __esModule: true, default: { template: '<div>HanamiSearch form</div>' } }));
vi.mock('@/pages/search.user.vue', () => ({ __esModule: true, default: { template: '<div>User search</div>' } }));

afterEach(() => { cleanup(); state.user = null; });

/** Oracle: each HanamiSearch permission independently permits its screen; standard search permission is unchanged. */
describe('HanamiSearch screen availability', () => {
	test.each([
		[false, false, false, false],
		[false, false, true, true],
		[false, true, false, true],
		[true, false, false, true],
	])('standard=%s v1=%s v2=%s permits screen=%s', async (standard, v1, v2, available) => {
		state.user = { policies: { canSearchNotes: standard, canSearchWithHanamiSearchV1: v1, canSearchWithHanamiSearchV2: v2 } };
		vi.resetModules();
		const permissions = await import('@/utility/check-permissions.js');
		expect(permissions.hanamiSearchAvailable).toBe(available);
		expect(permissions.notesSearchAvailable).toBe(standard);
	});

	test('does not grant guests access through a HanamiSearch permission', async () => {
		vi.resetModules();
		const permissions = await import('@/utility/check-permissions.js');
		expect(permissions.hanamiSearchAvailable).toBe(false);
	});

	test('opens the search form with only the v2 permission', async () => {
		state.user = { policies: { canSearchNotes: false, canSearchWithHanamiSearchV1: false, canSearchWithHanamiSearchV2: true } };
		vi.resetModules();
		const { default: Search } = await import('@/pages/search.vue');
		const view = render(Search, { global: { stubs: { PageWithHeader: { template: '<div><slot /></div>' } } } });
		expect(await view.findByText('HanamiSearch form')).toBeTruthy();
		expect(view.queryByText('Search unavailable')).toBeNull();
	});
});
