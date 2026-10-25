<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<component
	:is="prefer.s.animation ? TransitionGroup : 'div'"
	:enterActiveClass="$style.transition_x_enterActive"
	:leaveActiveClass="$style.transition_x_leaveActive"
	:enterFromClass="$style.transition_x_enterFrom"
	:leaveToClass="$style.transition_x_leaveTo"
	:moveClass="$style.transition_x_move"
	tag="div" :class="$style.root"
>
	<XReaction
		v-for="group in _reactions"
		:key="group.reaction"
		:reaction="group.reaction"
		:sourceReactions="group.sources"
		:reactionEmojis="props.reactionEmojis"
		:count="group.count"
		:isInitial="group.sources.some(source => initialReactions.has(source))"
		:noteId="props.noteId"
		:myReaction="props.myReaction"
		@reactionToggled="onMockToggleReaction"
	/>
	<slot v-if="hasMoreReactions" name="more"></slot>
</component>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { computed, inject, watch, ref } from 'vue';
import { TransitionGroup } from 'vue';
import { isSupportedEmoji } from '@@/js/emojilist.js';
import { getEmojiNameFromReaction, isLocalCustomEmojiReaction } from '@@/js/emoji-name.js';
import XReaction from '@/components/MkReactionsViewer.reaction.vue';
import { $i } from '@/i.js';
import { prefer } from '@/preferences.js';
import { customEmojisMap } from '@/custom-emojis.js';
import { DI } from '@/di.js';
import { groupReactions, includesReaction } from '@/utility/reaction-groups.js';
import type { ReactionGroup } from '@/utility/reaction-groups.js';

const props = withDefaults(defineProps<{
	noteId: Misskey.entities.Note['id'];
	reactions: Misskey.entities.Note['reactions'];
	reactionEmojis: Misskey.entities.Note['reactionEmojis'];
	myReaction: Misskey.entities.Note['myReaction'];
	maxNumber?: number;
}>(), {
	maxNumber: Infinity,
});

const mock = inject(DI.mock, false);

const emit = defineEmits<{
	(ev: 'mockUpdateMyReaction', emoji: string, delta: number): void;
}>();

const initialReactions = new Set(Object.keys(props.reactions));

const _reactions = ref<ReactionGroup[]>([]);
const hasMoreReactions = ref(false);
const groups = computed(() => groupReactions(props.reactions));

function onMockToggleReaction(emoji: string, count: number) {
	if (!mock) return;
	const group = _reactions.value.find(item => includesReaction(item.sources, emoji));
	if (!group) return;
	emit('mockUpdateMyReaction', emoji, count - group.count);
}

function canReact(reaction: string) {
	if (!$i) return false;
	// TODO: CheckPermissions
	return isLocalCustomEmojiReaction(reaction)
		? customEmojisMap.has(getEmojiNameFromReaction(reaction))
		: isSupportedEmoji(reaction);
}

watch([groups, () => props.maxNumber, () => props.myReaction], ([newSource, maxNumber]) => {
	hasMoreReactions.value = newSource.length > maxNumber;
	const byReaction = new Map(newSource.map(group => [group.reaction, group]));
	const retained = _reactions.value.flatMap(group => {
		const updated = byReaction.get(group.reaction);
		return updated ? [updated] : [];
	});
	const sorted = [...newSource];
	if (prefer.s.showAvailableReactionsFirstInNote) {
		const canReactCache = new Map(sorted.map(group => [group.reaction, canReact(group.reaction)]));
		sorted.sort((a, b) => Number(canReactCache.get(b.reaction)) - Number(canReactCache.get(a.reaction)) || b.count - a.count);
	} else {
		sorted.sort((a, b) => b.count - a.count);
	}
	const retainedNames = new Set(retained.map(group => group.reaction));
	const newReactions = [...retained, ...sorted.filter(group => !retainedNames.has(group.reaction))].slice(0, maxNumber);
	const myGroup = newSource.find(group => includesReaction(group.sources, props.myReaction));
	if (myGroup && !newReactions.includes(myGroup)) newReactions.push(myGroup);
	_reactions.value = newReactions;
}, { immediate: true, deep: true });
</script>

<style lang="scss" module>
.transition_x_move,
.transition_x_enterActive,
.transition_x_leaveActive {
	transition: opacity 0.2s cubic-bezier(0,.5,.5,1), transform 0.2s cubic-bezier(0,.5,.5,1) !important;
}
.transition_x_enterFrom,
.transition_x_leaveTo {
	opacity: 0;
	transform: scale(0.7);
}
.transition_x_leaveActive {
	position: absolute;
}

.root {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 4px;

	&:empty {
		display: none;
	}
}
</style>
