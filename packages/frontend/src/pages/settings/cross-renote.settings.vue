<template>
<div class="_gaps">
	<div class="_gaps_s">
		<MkSelect v-model="visibilityOverrides">
			<template #label>{{ i18n.ts._hana._crossRenote.visibilityOverride }}</template>
			<option value="_NONE_">{{ i18n.ts.auto }}</option>
			<option value="public">{{ i18n.ts._visibility.public }}</option>
			<option value="home">{{ i18n.ts._visibility.home }}</option>
			<option value="followers">{{ i18n.ts._visibility.followers }}</option>
		</MkSelect>
		<MkSwitch v-model="localOnly">
			<template #label>{{ i18n.ts._visibility.disableFederation }}</template>
		</MkSwitch>
	</div>
	<div class="_buttons">
		<MkButton danger @click="deleteAccount"><i class="ti ti-trash"></i>{{ i18n.ts.delete }}</MkButton>
	</div>
</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { i18n } from '@/i18n.js';

import MkSelect from '@/components/MkSelect.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkButton from '@/components/MkButton.vue';

import type { CrossRenoteStore } from '@/hana/scripts/cross-renote.js';

const props = defineProps<{
	account: CrossRenoteStore;
}>();

const emit = defineEmits<{
	(ev: 'changed', newValue: CrossRenoteStore): void;
	(ev: 'delete', id: string): void;
}>();

const visibilityOverrides = computed<CrossRenoteStore['visibilityOverride'] | '_NONE_'>({
	get: () => props.account.visibilityOverride ?? '_NONE_',
	set: (value) => {
		emit('changed', {
			...props.account,
			visibilityOverride: value === '_NONE_' ? undefined : value,
		});
	},
});

const localOnly = computed<boolean>({
	get: () => props.account.localOnly ?? false,
	set: (value) => {
		emit('changed', {
			...props.account,
			localOnly: value,
		});
	},
});

function deleteAccount() {
	emit('delete', props.account.id);
}
</script>

