<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #header><MkPageHeader v-model:tab="tab" :actions="headerActions" :tabs="headerTabs"/></template>

	<MkHorizontalSwipe v-model:tab="tab" :tabs="headerTabs">
		<MkSpacer v-if="tab === 'note'" key="note" :contentMax="800">
			<div v-if="notesSearchAvailable || ignoreNotesSearchAvailable">
				<XNote v-bind="props"/>
			</div>
			<div v-else>
				<MkInfo warn>{{ i18n.ts.notesSearchNotAvailable }}</MkInfo>
			</div>
		</MkSpacer>

		<MkSpacer v-if="tab === 'media'" key="media" :contentMax="800">
			<div v-if="notesSearchAvailable || ignoreNotesSearchAvailable">
				<XMedia v-bind="props"/>
			</div>
			<div v-else>
				<MkInfo warn>{{ i18n.ts.notesSearchNotAvailable }}</MkInfo>
			</div>
		</MkSpacer>

		<MkSpacer v-else-if="tab === 'user'" key="user" :contentMax="800">
			<XUser v-bind="props"/>
		</MkSpacer>
	</MkHorizontalSwipe>
</MkStickyContainer>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, ref, toRef } from 'vue';
import { i18n } from '@/i18n.js';
import { definePageMetadata } from '@/scripts/page-metadata.js';
import { notesSearchAvailable } from '@/scripts/check-permissions.js';
import MkInfo from '@/components/MkInfo.vue';
import MkHorizontalSwipe from '@/components/MkHorizontalSwipe.vue';

const props = withDefaults(defineProps<{
	query?: string,
	userId?: string,
	username?: string,
	host?: string | null,
	type?: 'note' | 'media' | 'user',
	origin?: 'combined' | 'local' | 'remote',
	// For storybook only
	ignoreNotesSearchAvailable?: boolean,
}>(), {
	query: '',
	userId: undefined,
	username: undefined,
	host: undefined,
	type: 'note',
	origin: 'combined',
	ignoreNotesSearchAvailable: false,
});

const XNote = defineAsyncComponent(() => import('./search.note.vue'));
const XMedia = defineAsyncComponent(() => import('./search.media.vue'));
const XUser = defineAsyncComponent(() => import('./search.user.vue'));

const tab = ref(toRef(props, 'type').value);

const headerActions = computed(() => []);

const headerTabs = computed(() => [{
	key: 'note',
	title: i18n.ts.notes,
	icon: 'ti ti-pencil',
}, {
	key: 'media',
	title: i18n.ts.media,
	icon: 'ti ti-photo',
}, {
	key: 'user',
	title: i18n.ts.users,
	icon: 'ti ti-users',
}]);

definePageMetadata(() => ({
	title: i18n.ts.search,
	icon: 'ti ti-search',
}));
</script>
