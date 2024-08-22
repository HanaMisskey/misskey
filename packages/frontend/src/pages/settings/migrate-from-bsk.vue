<template>
<div class="_gaps_m">
	<FormSection first>
		<template #label>{{ i18n.ts._hana._migrateFromBackspaceKey.step1 }}</template>

		<div class="_gaps">
			<div>{{ i18n.ts._hana._migrateFromBackspaceKey.step1Description }}</div>

			<MkButton v-if="linked" danger @click="disconnect">{{ i18n.ts.disconnectService }}</MkButton>
			<MkButton v-else primary @click="connect">{{ i18n.ts.connectService }}</MkButton>
		</div>
	</FormSection>
	<FormSection>
		<template #label>{{ i18n.ts._hana._migrateFromBackspaceKey.step2 }}</template>

		<div class="_gaps">
			<div>{{ i18n.ts._hana._migrateFromBackspaceKey.step2Description }}</div>
			<MkInfo warn>{{ i18n.ts._hana._migrateFromBackspaceKey.step2Description2 }}</MkInfo>
		</div>
	</FormSection>
	<FormSection>
		<template #label>{{ i18n.ts._hana._migrateFromBackspaceKey.step4 }}</template>

		<div class="_gaps">
			<I18n :src="i18n.ts._hana._migrateFromBackspaceKey.step4Description" tag="div">
				<template #bsk><a href="https://misskey.backspace.fm/settings/migration">BackspaceKey</a></template>
				<template #hana><MkA to="/settings/migration">{{ i18n.ts._hana.hanaMisskey }}</MkA></template>
			</I18n>
			<MkInfo warn>{{ i18n.ts._hana._migrateFromBackspaceKey.step4Description2 }}</MkInfo>
		</div>
	</FormSection>
</div>
</template>

<script setup lang="ts">
import { ref, defineAsyncComponent } from 'vue';

import { misskeyApi } from '@/scripts/misskey-api.js';
import { i18n } from '@/i18n.js';
import { url } from '@/config';
import * as os from '@/os.js';

import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import FormSection from '@/components/form/section.vue';

const props = defineProps<{
	sessionId?: string;
}>();

const linked = ref(false);

if (props.sessionId) {
	os.apiWithDialog('i/bsk-migrate/verify').then(() => {
		linked.value = true;
	}).catch(async () => {
		linked.value = (await misskeyApi('i/bsk-migrate/status')).linked;
	});
} else {
	linked.value = (await misskeyApi('i/bsk-migrate/status')).linked;
}

function disconnect() {
	os.apiWithDialog('i/bsk-migrate/remove');
	linked.value = false;
}

function connect() {
	const showing = ref(true);

	const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkWaitingDialog.vue')), {
		success: false,
		showing,
	}, {
		closed: () => dispose(),
	});

	misskeyApi('i/bsk-migrate/get-miauth-id').then(({ sessionId }) => {
		const miAuthUrl = new URL(`https://misskey.backspace.fm/miauth/${sessionId}`);
		miAuthUrl.searchParams.set('callback', `${url}/settings/migrate-from-bsk`);
		miAuthUrl.searchParams.set('name', i18n.ts._hana.hanaMisskey);
		miAuthUrl.searchParams.set('permission', 'read:account,write:notifications');

		location.href = miAuthUrl.toString();
	}).catch(() => {
		showing.value = false;
	});
}
</script>

<style scoped>

</style>
