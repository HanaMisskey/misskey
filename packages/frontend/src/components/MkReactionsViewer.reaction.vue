<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<button
	ref="buttonEl"
	v-ripple="canToggle"
	class="_button"
	:class="[$style.root, { [$style.reacted]: hasMyReaction, [$style.canToggle]: canToggle, [$style.small]: prefer.s.reactionsDisplaySize === 'small', [$style.large]: prefer.s.reactionsDisplaySize === 'large' }]"
	@click="toggleReaction()"
	@contextmenu.prevent.stop="menu"
>
	<MkReactionIcon style="pointer-events: none;" :class="prefer.s.limitWidthOfReaction ? $style.limitWidth : ''" :reaction="reaction" :emojiUrl="reactionEmojis[emojiName]"/>
	<span :class="$style.count">{{ count }}</span>
</button>
</template>

<script lang="ts" setup>
import { computed, inject, onMounted, useTemplateRef, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { getUnicodeEmojiOrNull } from '@@/js/emojilist.js';
import { getEmojiNameFromReaction, isLocalCustomEmojiReaction } from '@@/js/emoji-name.js';
import MkCustomEmojiDetailedDialog from './MkCustomEmojiDetailedDialog.vue';
import type { MenuItem } from '@/types/menu';
import XDetails from '@/components/MkReactionsViewer.details.vue';
import MkReactionIcon from '@/components/MkReactionIcon.vue';
import * as os from '@/os.js';
import { misskeyApi, misskeyApiGet } from '@/utility/misskey-api.js';
import { useTooltip } from '@/composables/use-tooltip.js';
import { $i } from '@/i.js';
import MkReactionEffect from '@/components/MkReactionEffect.vue';
import { i18n } from '@/i18n.js';
import * as sound from '@/utility/sound.js';
// import { checkReactionPermissions } from '@/utility/check-reaction-permissions.js';
import { customEmojisMap } from '@/custom-emojis.js';
import { prefer } from '@/preferences.js';
import { DI } from '@/di.js';
import { noteEvents } from '@/composables/use-note-capture.js';
import { getEmojiMuteKey, mute as muteEmoji, unmute as unmuteEmoji, isMuted as isEmojiMuted } from '@/utility/emoji-mute.js';
import { fetchReactionGroup, includesReaction } from '@/utility/HanaReactionGroups.js';
import { addToEmojiPalette } from '@/utility/emoji-palette.js';
import { haptic } from '@/utility/haptic.js';

const props = defineProps<{
	noteId: Misskey.entities.Note['id'];
	reaction: string;
	sourceReactions?: string[];
	reactionEmojis: Misskey.entities.Note['reactionEmojis'];
	myReaction: Misskey.entities.Note['myReaction'];
	count: number;
	isInitial: boolean;
}>();

const mock = inject(DI.mock, false);

const emit = defineEmits<{
	(ev: 'reactionToggled', emoji: string, newCount: number): void;
}>();

const buttonEl = useTemplateRef('buttonEl');

const sources = computed(() => props.sourceReactions ?? [props.reaction]);
const hasMyReaction = computed(() => includesReaction(sources.value, props.myReaction));

const emojiName = computed(() => getEmojiNameFromReaction(props.reaction));

const isLocalCustomEmoji = computed(() => isLocalCustomEmojiReaction(props.reaction));

const canToggle = computed(() => {
	const emoji = isLocalCustomEmoji.value ? customEmojisMap.get(emojiName.value) : getUnicodeEmojiOrNull(props.reaction);

	// TODO
	//return $i != null && emoji != null && checkReactionPermissions($i, props.note, emoji);
	return $i != null && (hasMyReaction.value || emoji != null);
});

async function toggleReaction() {
	if (!canToggle.value) return;
	if ($i == null) return;

	const me = $i;

	const oldReaction = props.myReaction;
	const removing = hasMyReaction.value;
	const targetReaction = props.reaction;
	if (oldReaction) {
		const confirm = await os.confirm({
			type: 'warning',
			text: !removing ? i18n.ts.changeReactionConfirm : i18n.ts.cancelReactionConfirm,
		});
		if (confirm.canceled) return;

		if (!removing) {
			sound.playMisskeySfx('reaction');
			haptic();
		}

		if (mock) {
			emit('reactionToggled', removing ? oldReaction : targetReaction, (props.count - 1));
			return;
		}

		misskeyApi('notes/reactions/delete', {
			noteId: props.noteId,
		}).then(() => {
			noteEvents.emit(`unreacted:${props.noteId}`, {
				userId: me.id,
				reaction: oldReaction,
			});
			if (!removing) {
				misskeyApi('notes/reactions/create', {
					noteId: props.noteId,
					reaction: targetReaction,
				}).then(() => {
					const emoji = customEmojisMap.get(emojiName.value);
					if (emoji == null && getUnicodeEmojiOrNull(targetReaction) == null) {
						return;
					}
					noteEvents.emit(`reacted:${props.noteId}`, {
						userId: me.id,
						reaction: targetReaction,
						emoji: emoji,
					});
				});
			}
		});
	} else {
		if (prefer.s.confirmOnReact) {
			const confirm = await os.confirm({
				type: 'question',
				text: i18n.tsx.reactAreYouSure({ emoji: targetReaction.replace('@.', '') }),
			});

			if (confirm.canceled) return;
		}

		sound.playMisskeySfx('reaction');
		haptic();

		if (mock) {
			emit('reactionToggled', targetReaction, (props.count + 1));
			return;
		}

		misskeyApi('notes/reactions/create', {
			noteId: props.noteId,
			reaction: targetReaction,
		}).then(() => {
			const emoji = customEmojisMap.get(emojiName.value);
			if (emoji == null && getUnicodeEmojiOrNull(targetReaction) == null) {
				return;
			}

			noteEvents.emit(`reacted:${props.noteId}`, {
				userId: me.id,
				reaction: targetReaction,
				emoji: emoji,
			});
		});
		// TODO: 上位コンポーネントでやる
		//if (props.note.text && props.note.text.length > 100 && (Date.now() - new Date(props.note.createdAt).getTime() < 1000 * 3)) {
		//	claimAchievement('reactWithoutRead');
		//}
	}
}

async function menu(ev: PointerEvent) {
	const menuItems: MenuItem[] = [];
	const mutedSources = [...new Set(sources.value.filter(isEmojiMuted).map(getEmojiMuteKey))];
	if (mutedSources.length > 0) {
		os.popupMenu([{
			type: 'parent',
			text: i18n.ts.emojiUnmute,
			icon: 'ti ti-mood-smile',
			children: mutedSources.map(source => ({
				text: source,
				action: async () => {
					const { canceled } = await os.confirm({
						type: 'question',
						title: i18n.tsx.unmuteX({ x: source }),
					});
					if (!canceled) unmuteEmoji(source);
				},
			})),
		}], ev.currentTarget ?? ev.target);
		return;
	}

	if (isLocalCustomEmoji.value) {
		menuItems.push({
			text: i18n.ts.info,
			icon: 'ti ti-info-circle',
			action: async () => {
				const { dispose } = os.popup(MkCustomEmojiDetailedDialog, {
					emoji: await misskeyApiGet('emoji', {
						name: emojiName.value,
					}),
				}, {
					closed: () => dispose(),
				});
			},
		});
	}

	menuItems.push({
		text: i18n.ts.emojiMute,
		icon: 'ti ti-mood-off',
		action: () => {
			os.confirm({
				type: 'question',
				title: i18n.tsx.muteX({ x: isLocalCustomEmoji.value ? `:${emojiName.value}:` : props.reaction }),
			}).then(({ canceled }) => {
				if (canceled) return;
				muteEmoji(props.reaction);
			});
		},
	});

	if (canToggle.value) {
		menuItems.push({
			text: i18n.ts.addToEmojiPalette,
			icon: 'ti ti-palette',
			action: () => {
				addToEmojiPalette(isLocalCustomEmoji.value ? `:${emojiName.value}:` : props.reaction);
			},
		});
	}

	os.popupMenu(menuItems, ev.currentTarget ?? ev.target);
}

function anime() {
	if (window.document.hidden || !prefer.s.animation || buttonEl.value == null) return;

	const rect = buttonEl.value.getBoundingClientRect();
	const x = rect.left + 16;
	const y = rect.top + (buttonEl.value.offsetHeight / 2);
	const { dispose } = os.popup(MkReactionEffect, { reaction: props.reaction, x, y }, {
		end: () => dispose(),
	});
}

watch(() => props.count, (newCount, oldCount) => {
	if (oldCount < newCount) anime();
});

onMounted(() => {
	if (!props.isInitial) anime();
});

if (!mock) {
	useTooltip(buttonEl, async (showing) => {
		if (buttonEl.value == null) return;

		const reactions = await fetchReactionGroup({
			noteId: props.noteId,
			types: sources.value,
			limit: 10,
		});

		const users = reactions.map(x => x.user);

		const { dispose } = os.popup(XDetails, {
			showing,
			reaction: props.reaction,
			users,
			count: props.count,
			anchorElement: buttonEl.value,
		}, {
			closed: () => dispose(),
		});
	}, 100);
}
</script>

<style lang="scss" module>
.root {
	display: inline-flex;
	height: 42px;
	padding: 0 6px;
	font-size: 1.5em;
	border-radius: 6px;
	align-items: center;
	justify-content: center;

	&.canToggle {
		background: var(--MI_THEME-buttonBg);

		&:hover {
			background: rgba(0, 0, 0, 0.1);
		}
	}

	&:not(.canToggle) {
		cursor: default;
	}

	&.small {
		height: 32px;
		font-size: 1em;
		border-radius: 4px;

		> .count {
			font-size: 0.9em;
			line-height: 32px;
		}
	}

	&.large {
		height: 52px;
		font-size: 2em;
		border-radius: 8px;

		> .count {
			font-size: 0.6em;
			line-height: 52px;
		}
	}

	&.reacted, &.reacted:hover {
		background: var(--MI_THEME-accentedBg);
		color: var(--MI_THEME-accent);
		box-shadow: 0 0 0 1px var(--MI_THEME-accent) inset;

		> .count {
			color: var(--MI_THEME-accent);
		}

		> .icon {
			filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.5));
		}
	}
}

.limitWidth {
	max-width: 70px;
	object-fit: contain;
}

.count {
	font-size: 0.7em;
	line-height: 42px;
	margin: 0 0 0 4px;
}
</style>
