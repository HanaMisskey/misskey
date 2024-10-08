<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.noteEmbedRoot">
	<EmNoteDetailed v-if="note && !prohibited" :note="note" :class="$style.note"/>
	<a v-if="note && !prohibited" :href="`${url}/notes/${noteId}`" target="_blank" :class="$style.cta">
		<div :class="$style.link">{{ i18n.tsx._hana.showOnX({ x: i18n.ts._hana.hanaMisskey }) }}</div>
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

const props = defineProps<{
	noteId: string;
}>();

const serverContext = inject(DI.serverContext)!;

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
}

.cta {
	height: calc(100% + var(--radius));
	padding: 0 16px 16px;
	color: var(--accent);
	font-weight: 700;
	display: block;

	.link {
		display: block;
		border-radius: 999px;
		padding: calc(var(--margin) / 2) var(--margin);
		background-color: var(--fgOnAccent);
		color: var(--accent);
		border: solid 1px var(--accent);
		text-align: center;
		transition: color 0.2s, background-color 0.2s;
		font-size: .9em;
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
