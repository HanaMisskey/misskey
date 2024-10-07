<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.noteEmbedRoot, { [$style.rounded]: embedParams.rounded }]">
	<EmNoteDetailed v-if="note && !prohibited" :note="note" :class="$style.note"/>
	<a v-if="note && !prohibited" :href="`${url}/notes/${noteId}`" target="_blank" :class="$style.cta">
		<img :class="$style.particles" src="https://static-assets.misskey.flowers/misc/bg-particles/left_v1a.svg"/>
		<div :class="$style.text">{{ i18n.ts._hana._welcome._cta.title }}</div>
		<div :class="$style.link">{{ i18n.ts.learnMore }}</div>
	</a>
	<XNotFound v-else/>
</div>
</template>

<script setup lang="ts">
import { inject, ref } from 'vue';
import * as Misskey from 'misskey-js';
import EmNoteDetailed from '@/components/EmNoteDetailed.vue';
import XNotFound from '@/pages/not-found.vue';
import { DI } from '@/di.js';
import { misskeyApi } from '@/misskey-api.js';
import { assertServerContext } from '@/server-context';
import { i18n } from '@/i18n.js';
import { url } from '@@/js/config.js';
import { defaultEmbedParams } from '@@/js/embed-page.js';

const props = defineProps<{
	noteId: string;
}>();

const serverContext = inject(DI.serverContext)!;

const embedParams = inject(DI.embedParams, defaultEmbedParams);

const note = ref<Misskey.entities.Note | null>(null);

const prohibited = ref(false);

if (assertServerContext(serverContext, 'note')) {
	note.value = serverContext.note;
} else {
	note.value = await misskeyApi('notes/show', {
		noteId: props.noteId,
	}).catch(() => {
		return null;
	});
}

if (note.value?.url != null || note.value?.uri != null) {
	// リモートサーバーのノートは弾く
	prohibited.value = true;
}
</script>

<style lang="scss" module>
.noteEmbedRoot {
	background-image: linear-gradient(90deg, var(--buttonGradateA), var(--buttonGradateB));
}

.noteEmbedRoot.rounded {
	.note {
		border-radius: 0 0 var(--radius) var(--radius);
	}
}

.note {
	background-color: var(--panel);
	box-shadow: 0px 4px 8px rgba(0, 0, 0, 0.1);
}

.cta {
	height: calc(100% + var(--radius));
	padding: var(--margin) calc(var(--margin) * 1.5);
	color: var(--fgOnAccent);
	font-weight: 700;
	display: flex;
	position: relative;
	align-items: center;
	overflow: hidden;

	.particles {
		position: absolute;
		bottom: 0;
		left: 0;
		transform: rotateX(180deg);
		width: 80%;
		opacity: 0.75;
		pointer-events: none;
    -webkit-user-select: none;
    user-select: none;
    -webkit-user-drag: none;
	}

	.text, .link {
		position: relative;
	}

	.text {
		font-size: 1.15em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.link {
		margin-left: auto;
		flex-shrink: 0;
		display: block;
		border-radius: 999px;
		padding: calc(var(--margin) / 4) var(--margin);
		background-color: transparent;
		color: var(--fgOnAccent);
		border: solid 1px var(--fgOnAccent);
		transition: color 0.2s, background-color 0.2s;
	}

	&:hover {
		text-decoration: none;

		.link {
			background-color: var(--fgOnAccent);
			color: var(--accent);
		}
	}
}
</style>
