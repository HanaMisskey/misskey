<template>
	<div :class="$style.root">
		<img
			v-if="plan != null && !imageLoadFailed"
			ref="imageEl"
			:src="`https://static-assets.misskey.flowers/misc/premium/plan-kv/${plan.slug}.png`"
			:alt="plan?.planName ?? 'Free Plan'"
			:class="$style.planImage"
		/>
		<div :class="[$style.planRoot, { [$style.free]: plan == null, [$style.paid]: plan != null, [$style.noImage]: imageLoadFailed || plan == null }]" :style="plan == null ? {} : { background: `var(--HNM_G-${plan.slug}, #555)` }">
			{{ plan?.planName ?? i18n.ts._hana._subscription.none }}
		</div>
	</div>
</template>

<script setup lang="ts">
import { useTemplateRef, onBeforeUnmount, watch, ref } from 'vue';
import { i18n } from '@/i18n.js';

defineProps<{
	plan: {
		slug: string;
		planName: string;
	} | null;
}>();

const imageEl = useTemplateRef('imageEl');
const imageLoadFailed = ref(false);

function onImageLoad() {
	if (imageEl.value == null) return;
	if (imageEl.value.naturalWidth === 0) {
		imageLoadFailed.value = true;
	}
}

const watchStop = watch(imageEl, (el) => {
	if (el == null) return;
	if (el.complete) {
		if (el.naturalWidth === 0) {
			imageLoadFailed.value = true;
		}
	} else {
		el.addEventListener('load', onImageLoad);
	}
	watchStop();
}, { immediate: true });

onBeforeUnmount(() => {
	const el = imageEl.value;
	if (el == null) return;
	el.removeEventListener('load', onImageLoad);
});
</script>

<style module>
.root {
	position: relative;
	display: flex;
	flex-direction: column;
	justify-content: flex-end;
	width: 100%;
	height: 100%;
}

.planImage {
	width: 100%;
	height: auto;
	z-index: 2;
	pointer-events: none;
}

.planRoot {
	margin-top: -15%;
	padding-top: 17.5%;
	padding-left: 1em;
	padding-right: 1em;
	padding-bottom: 0.8em;
	box-sizing: border-box;
	border-radius: var(--MI-radius);
	font-weight: 700;
	text-align: center;
	font-size: 1.1em;
	word-break: break-all;
	word-break: auto-phrase;
	z-index: 1;
}

.planRoot.noImage {
	margin-top: 0;
	padding-top: 1em;
}

.planRoot.paid {
	color: #fff;
}

.planRoot.free {
	background: hsl(from var(--MI_THEME-bg) h s calc(l - 10));
}
</style>
