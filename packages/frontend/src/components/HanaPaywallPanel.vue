<template>
<div class="_panel" :class="$style.panelRoot">
	<div :class="$style.panelMask"></div>
	<div :class="$style.panelContent" class="_gaps_s">
		<h2 style="margin: 0;">{{ (funcName && planName) ? i18n.tsx._hana._paywallPanel.title({ func: funcName, plan: planName }) : i18n.ts._hana._paywallPanel.titleFallback }}</h2>
		<div>はなみすきープレミアムに登録して、あなた色の花が咲き誇るSNS体験をしてみませんか。</div>
		<div>
			<MkButton :link="true" to="/pricing" :class="$style.pricingButton" :large="true">詳しく見る</MkButton>
		</div>
	</div>
</div>
</template>

<script setup lang="ts">
import { i18n } from '@/i18n.js';
import MkButton from '@/components/MkButton.vue';

defineProps<{
	funcName?: string;
	planName?: string;
}>();
</script>

<style module>
.panelRoot {
	position: relative;
	background-image: url('/client-assets/hanami/paywall-mask.svg');
	background-color: var(--buttonGradateB);
	background-size: 180px;
	background-repeat: repeat;
	color: var(--fgOnAccent);
}

.panelRoot *::selection {
	background-color: var(--fgOnAccent);
	color: var(--accent);
}

.panelMask {
	position: absolute;
	left: 0;
	top: 0;
	width: 100%;
	height: 100%;
	background-image: linear-gradient(90deg, var(--buttonGradateA) 10%, transparent);
}

.panelContent {
	position: relative;
	padding: 24px;
}

.pricingButton {
	background-color: var(--panel);
	color: var(--fg);
}

.pricingButton:not(.disabled):hover {
	background-color: var(--panelHighlight);
}
</style>
