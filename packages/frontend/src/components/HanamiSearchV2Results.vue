<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps" data-testid="hanamisearch-v2-results">
	<div v-if="showAsGrid && notes.length > 0" :class="$style.grid">
		<MkNoteMediaGrid v-for="note in notes" :key="note.id" :note="note" square/>
	</div>
	<div v-else-if="notes.length > 0" class="_gaps" :class="$style.notes">
		<MkNote v-for="note in notes" :key="note.id" class="_panel" :note="note" :withHardMute="true"/>
	</div>
	<MkLoading v-if="loading"/>
	<MkError v-else-if="error" @retry="loadMore"/>
	<MkButton v-else-if="nextCursor != null" :class="$style.more" primary rounded @click="loadMore">{{ i18n.ts.loadMore }}</MkButton>
	<MkResult v-else-if="notes.length === 0" type="empty" :text="i18n.ts.noNotes"/>
</div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import type { HanamiSearchV2Params } from '@/utility/hanamisearch-v2.js';
import { createHanamiSearchV2 } from '@/utility/hanamisearch-v2.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { useGlobalEvent } from '@/events.js';
import MkButton from '@/components/MkButton.vue';
import MkNote from '@/components/MkNote.vue';
import MkNoteMediaGrid from '@/components/MkNoteMediaGrid.vue';

const props = defineProps<{
	params: HanamiSearchV2Params;
	showAsGrid?: boolean;
}>();

const state = createHanamiSearchV2<Misskey.entities.Note>(params => misskeyApi('notes/hanamisearch-v2', params));
const { notes, nextCursor, loading, error, loadMore } = state;

watch(() => props.params, params => state.search(params), { immediate: true, deep: true });
onBeforeUnmount(state.dispose);
useGlobalEvent('noteDeleted', id => {
	notes.value = notes.value.filter(note => note.id !== id);
});
</script>

<style module lang="scss">
.grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
	gap: 6px;
}

.notes {
	container-type: inline-size;
}

.more {
	margin: 0 auto;
}
</style>
