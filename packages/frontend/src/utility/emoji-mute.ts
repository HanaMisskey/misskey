/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, toValue } from 'vue';
import type { MaybeRefOrGetter } from 'vue';
import { normalizeCustomEmojiName } from '@@/js/emoji-name.js';
import { prefer } from '@/preferences.js';

export function makeEmojiMuteKey(props: { name: string; host?: string | null }) {
	const [name, embeddedHost] = normalizeCustomEmojiName(props.name).split('@');
	const host = props.host ?? embeddedHost;
	return `:${name}${host && host !== '.' ? `@${host}` : ''}:`;
}

export function getEmojiMuteKey(emoji: string): string {
	return emoji.startsWith(':') && emoji.endsWith(':')
		? makeEmojiMuteKey({ name: emoji })
		: emoji.replace(/\uFE0F/g, '');
}

const mutedKeys = computed(() => new Set(prefer.r.mutingEmojis.value.map(getEmojiMuteKey)));

export function extractCustomEmojiName (name:string) {
	return normalizeCustomEmojiName(name).split('@')[0];
}

export function extractCustomEmojiHost (name:string) {
	// nameは:emojiName@host:の形式
	// 取り出したい部分はhostなので、@以降を取り出す
	const index = name.indexOf('@');
	if (index === -1) {
		return null;
	}
	const host = name.substring(index + 1, name.length - 1);
	if (host === '' || host === '.') {
		return null;
	}
	return host;
}

export function mute(emoji: string) {
	const emojiMuteKey = getEmojiMuteKey(emoji);
	const mutedEmojis = prefer.r.mutingEmojis.value;
	if (!mutedKeys.value.has(emojiMuteKey)) {
		return prefer.commit('mutingEmojis', [...mutedEmojis, emojiMuteKey]);
	}
	throw new Error('Emoji is already muted', { cause: `${emojiMuteKey} is Already Muted` });
}

export function unmute(emoji:string) {
	const emojiMuteKey = getEmojiMuteKey(emoji);
	const mutedEmojis = prefer.r.mutingEmojis.value;
	prefer.commit('mutingEmojis', mutedEmojis.filter((e) => getEmojiMuteKey(e) !== emojiMuteKey));
}

export function checkMuted(emoji: MaybeRefOrGetter<string>) {
	return computed(() => isMuted(toValue(emoji)));
}

export function isMuted(emoji: string): boolean {
	return mutedKeys.value.has(getEmojiMuteKey(emoji));
}
