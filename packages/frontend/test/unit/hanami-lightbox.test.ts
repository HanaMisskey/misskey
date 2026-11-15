/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { nextTick } from 'vue';

vi.mock('@/os.js', () => ({ claimZIndex: () => 100, popupMenu: vi.fn() }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false, dataSaver: { media: false }, imageOrientation: 'auto', useNativeUiForVideoAudioPlayer: true } } }));
vi.mock('@/utility/sensitive-file.js', () => ({ shouldHideFileByDefault: () => false, canRevealFile: async () => true }));
vi.mock('@/utility/get-file-menu.js', () => ({ getFileMenu: () => [] }));
vi.mock('@/utility/focus-trap.js', () => ({ focusTrap: () => ({ release: vi.fn() }) }));
vi.mock('@/utility/touch.js', () => ({ isTouchUsing: false }));
vi.mock('@/components/MkLightbox.item.controls.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkLightbox.item.fileinfo.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkBlurhash.vue', () => ({ default: { render: () => null } }));

import MkLightbox from '@/components/MkLightbox.vue';
import type { Content } from '@/components/MkLightbox.item.vue';

const image = (id: string): Content => ({ id, type: 'image', url: `https://example.test/${id}.png`, width: 600, height: 400 });
function gallery(contents = [image('first'), image('second')], defaultIndex = 0) {
	const opened: string[] = [];
	const view = render(MkLightbox, { props: { contents, defaultIndex, onImageOpen: (fileId: string) => opened.push(fileId) }, global: { directives: { hotkey: {} }, stubs: { MkLoading: true, MkCondensedLine: true } } });
	return { ...view, opened };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

/** Oracle: the existing recommendation interaction contract counts opening an image, switching to a different attached image and beginning deliberate enlargement as independent image operations. Merely preloading a sibling or continuing an existing zoom is not an operation. The real gallery and item handle browser clicks/wheel events; rendering-only controls and focus management are isolated. */
describe('recommendation image operations in the current gallery', () => {
	test('reports only the selected image at open and when moving between images', async () => {
		const view = gallery();
		await nextTick();
		expect(view.opened).toEqual(['first']);
		await fireEvent.click(view.container.querySelector('.ti-arrow-right')!.closest('button')!);
		await nextTick();
		expect(view.opened).toEqual(['first', 'second']);
		await fireEvent.click(view.container.querySelector('.ti-arrow-left')!.closest('button')!);
		await nextTick();
		expect(view.opened).toEqual(['first', 'second', 'first']);
	});

	test('reports enlargement once until zoom returns to its initial size', async () => {
		const view = gallery([image('first')]);
		await nextTick();
		const target = view.container.querySelector('img')!;
		await fireEvent.wheel(target, { deltaY: -100, clientX: 200, clientY: 200 });
		expect(view.opened).toEqual(['first', 'first']);
		await fireEvent.wheel(target, { deltaY: -100, clientX: 200, clientY: 200 });
		expect(view.opened).toEqual(['first', 'first']);
		await fireEvent.wheel(target, { deltaY: 100, clientX: 200, clientY: 200 });
		await fireEvent.wheel(target, { deltaY: 100, clientX: 200, clientY: 200 });
		await fireEvent.wheel(target, { deltaY: 100, clientX: 200, clientY: 200 });
		await fireEvent.wheel(target, { deltaY: -100, clientX: 200, clientY: 200 });
		expect(view.opened).toEqual(['first', 'first', 'first']);
	});

	test('uses the selected file identity when opening directly at the second image', async () => {
		const view = gallery([image('first'), image('second')], 1);
		await nextTick();
		expect(view.opened).toEqual(['second']);
	});

	test('does not report audio as an image operation', async () => {
		vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
		vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
		const view = gallery([{ id: 'audio', type: 'audio', url: 'https://example.test/audio.mp3' }]);
		await nextTick();
		expect(view.opened).toEqual([]);
	});
});
