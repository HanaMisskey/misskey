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
       <XReaction v-for="[reaction, count] in reactions" :key="reaction" :reaction="reaction" :count="count" :isInitial="initialReactions.value.has(reaction)" :note="note" :displayMyReaction="displayMyReaction" @reactionToggled="onMockToggleReaction"/>
	<slot v-if="hasMoreReactions" name="more"/>
</component>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { inject, watch, ref, computed } from 'vue';
import { TransitionGroup } from 'vue';
import XReaction from '@/components/MkReactionsViewer.reaction.vue';
import { prefer } from '@/preferences.js';
import { mutedEmojis } from '@/muted-emojis.js';
import { DI } from '@/di.js';

const props = withDefaults(defineProps<{
	note: Misskey.entities.Note;
	maxNumber?: number;
}>(), {
	maxNumber: Infinity,
});

const mock = inject(DI.mock, false);

const emit = defineEmits<{
	(ev: 'mockUpdateMyReaction', emoji: string, delta: number): void;
}>();

const displayReactionsSource = computed(() => {
        const res: Record<string, number> = {};
        for (const [k, v] of Object.entries(props.note.reactions)) {
                const name = k.replace(/:/g, '').replace(/@\./, '');
                if (mutedEmojis.value.includes(name)) {
                        res['❤️'] = (res['❤️'] || 0) + v;
                } else {
                        res[k] = v;
                }
        }
        return res;
});

const initialReactions = computed(() => new Set(Object.keys(displayReactionsSource.value)));

const displayMyReaction = computed(() => {
        if (!props.note.myReaction) return null;
        const name = props.note.myReaction.replace(/:/g, '').replace(/@\./, '');
        return mutedEmojis.value.includes(name) ? '❤️' : props.note.myReaction;
});

const reactions = ref<[string, number][]>([]);
const hasMoreReactions = ref(false);

if (displayMyReaction.value && !Object.keys(reactions.value).includes(displayMyReaction.value)) {
        reactions.value[displayMyReaction.value] = displayReactionsSource.value[displayMyReaction.value];
}

function onMockToggleReaction(emoji: string, count: number) {
	if (!mock) return;

	const i = reactions.value.findIndex((item) => item[0] === emoji);
	if (i < 0) return;

	emit('mockUpdateMyReaction', emoji, (count - reactions.value[i][1]));
}

watch([displayReactionsSource, () => props.maxNumber], ([newSource, maxNumber]) => {
	let newReactions: [string, number][] = [];
        hasMoreReactions.value = Object.keys(newSource).length > maxNumber;

	for (let i = 0; i < reactions.value.length; i++) {
		const reaction = reactions.value[i][0];
		if (reaction in newSource && newSource[reaction] !== 0) {
			reactions.value[i][1] = newSource[reaction];
			newReactions.push(reactions.value[i]);
		}
	}

	const newReactionsNames = newReactions.map(([x]) => x);
	newReactions = [
		...newReactions,
		...Object.entries(newSource)
			.sort(([, a], [, b]) => b - a)
			.filter(([y], i) => i < maxNumber && !newReactionsNames.includes(y)),
	];

	newReactions = newReactions.slice(0, props.maxNumber);

        if (displayMyReaction.value && !newReactions.map(([x]) => x).includes(displayMyReaction.value)) {
                newReactions.push([displayMyReaction.value, newSource[displayMyReaction.value]]);
        }

	reactions.value = newReactions;
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
