<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div data-testid="hanamisearch-v2-results">
	<MkPagination v-if="showAsGrid" v-slot="{ items }" :paginator="paginator" :autoLoad="false">
		<div :class="$style.grid">
			<MkNoteMediaGrid v-for="note in items" :key="note.id" :note="note" square/>
		</div>
	</MkPagination>
	<MkNotesTimeline v-else :paginator="paginator" :autoLoad="false" :withControl="false"/>
</div>
</template>

<script setup lang="ts">
import { markRaw, onBeforeUnmount, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import type { HanamiSearchV2Params } from '@/utility/hanamisearch-v2.js';
import { createHanamiSearchV2Paginator } from '@/utility/hanamisearch-v2.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { useGlobalEvent } from '@/events.js';
import MkPagination from '@/components/MkPagination.vue';
import MkNotesTimeline from '@/components/MkNotesTimeline.vue';
import MkNoteMediaGrid from '@/components/MkNoteMediaGrid.vue';

const props = defineProps<{
	params: HanamiSearchV2Params;
	showAsGrid?: boolean;
}>();

const paginator = markRaw(createHanamiSearchV2Paginator<Misskey.entities.Note>(() => props.params, params => misskeyApi('notes/hanamisearch-v2', params)));

watch(() => props.params, () => paginator.reload(), { immediate: true, deep: true });
onBeforeUnmount(paginator.dispose);
useGlobalEvent('noteDeleted', id => {
	paginator.removeItem(id);
});
</script>

<style module lang="scss">
.grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
	gap: 6px;
}

</style>
