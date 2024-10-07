<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.noteEmbedRoot">
	<EmNoteDetailed v-if="note && !prohibited" :note="note" :class="$style.note"/>
	<a v-if="note && !prohibited" :href="`${url}/notes/${noteId}`" target="_blank" :class="$style.cta">
		<img :class="$style.particles" src="https://static-assets.misskey.flowers/misc/bg-particles/popup_v1.png"/>
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
	background-color: var(--panel);
}

.note {
	background-color: var(--panel);
	border-bottom: solid 1px var(--divider);
}

.cta {
	height: calc(100% + var(--radius));
	padding: var(--margin) calc(var(--margin) * 1.5);
	color: var(--accent);
	font-weight: 700;
	display: flex;
	position: relative;
	align-items: center;
	overflow: hidden;

	.particles {
		position: absolute;
		bottom: 0;
		right: 0;
		width: 90%;
		height: auto;
		opacity: 0.5;
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
		background-color: var(--fgOnAccent);
		color: var(--accent);
		border: solid 1px var(--accent);
		transition: color 0.2s, background-color 0.2s;
	}

	&:hover {
		text-decoration: none;

		.link {
			background-color: var(--accent);
			color: var(--fgOnAccent);
		}
	}
}
</style>
