<template>
<div class="_gaps">
	<div style="word-break: auto-phrase; text-align: center; padding: 0 16px;">{{ i18n.ts._hana.hanaModeTutorialDescription }}</div>

	<HanaHanaModeSwitcher :specifyManually="true" @set="onSet" />
</div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { i18n } from '@/i18n.js';
import HanaHanaModeSwitcher from '@/components/HanaHanaModeSwitcher.vue';
import type { TutorialPageCommonExpose } from '@/components/MkTutorial.vue';

const canContinue = ref(false);

function onSet() {
	canContinue.value = true;
}

defineExpose<TutorialPageCommonExpose>({
	canContinue,
});
</script>

<style lang="scss" module>

</style>
