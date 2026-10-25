/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { preferReactive, preferState } from '../setup.unit.js';
import { prefer } from '@/preferences.js';
import { isMuted, makeEmojiMuteKey, mute, unmute } from '@/utility/emoji-mute.js';
import MkEmoji from '@/components/global/MkEmoji.vue';
import MkCustomEmoji from '@/components/global/MkCustomEmoji.vue';

vi.mock('@/custom-emojis.js', () => ({ customEmojisMap: new Map() }));

/** Picker と HTTP/WS は同じ絵文字を別表記で渡す。保存済み設定も同じ対象として読み、解除する。 */
describe('emoji mute identity', () => {
	const commit = vi.fn((key: string, value: unknown) => {
		preferReactive[key].value = value;
		preferState[key] = value;
	});

	beforeEach(() => {
		Object.defineProperty(prefer, 'commit', { configurable: true, value: commit });
		commit.mockClear();
		preferReactive.mutingEmojis.value = [];
		preferState.emojiStyle = 'native';
	});

	afterEach(() => cleanup());

	test('VS16付きの保存値はHTTP表記にも効き、HTTP表記から解除できる', () => {
		preferReactive.mutingEmojis.value = ['☕️'];
		expect(isMuted('☕')).toBe(true);
		unmute('☕');
		expect(preferReactive.mutingEmojis.value).toEqual([]);
		mute('☕️');
		expect(isMuted('☕')).toBe(true);
	});

	/** localの@.だけを同一視し、同名の別hostを巻き込まない。 */
	test('localの二表記とremote hostを区別する', () => {
		preferReactive.mutingEmojis.value = [':blob@.:', ':blob@a.test:'];
		expect(isMuted(':blob:')).toBe(true);
		expect(isMuted(':blob@a.test:')).toBe(true);
		expect(isMuted(':blob@b.test:')).toBe(false);
		expect(makeEmojiMuteKey({ name: ':blob:', host: 'a.test' })).toBe(':blob@a.test:');
		unmute(':blob:');
		expect(preferReactive.mutingEmojis.value).toEqual([':blob@a.test:']);
	});

	/** 同じSFCが別emojiのpropsで再利用されても、新しい対象のミュート状態を表示する。 */
	test('MkEmojiは再利用時のemoji propsで判定し直す', async () => {
		preferReactive.mutingEmojis.value = ['😺'];
		const view = render(MkEmoji, { props: { emoji: '👍' } });
		expect(view.queryByText('❤️')).toBeNull();
		await view.rerender({ emoji: '😺' });
		expect(view.getByText('❤️')).toBeTruthy();
		await view.rerender({ emoji: '👍' });
		expect(view.queryByText('❤️')).toBeNull();
	});

	/** remote著者の絵文字はnameとhostに分かれて渡る。画像のURLがあってもミュートを優先する。 */
	test('MkCustomEmojiはnameとhostの変更を追跡してremote画像をマスクする', async () => {
		preferReactive.mutingEmojis.value = [':blob@a.test:', ':other@b.test:'];
		const view = render(MkCustomEmoji, { props: { name: ':blob:', host: 'a.test', url: '/blob.png' } });
		expect(view.getByText('❤️')).toBeTruthy();
		expect(view.container.querySelector('img')).toBeNull();
		await view.rerender({ name: ':blob:', host: 'b.test', url: '/blob.png' });
		expect(view.container.querySelector('img')).not.toBeNull();
		await view.rerender({ name: ':other:', host: 'b.test', url: '/other.png' });
		expect(view.getByText('❤️')).toBeTruthy();
		expect(view.container.querySelector('img')).toBeNull();
	});
});
