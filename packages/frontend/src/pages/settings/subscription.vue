<template>
<SearchMarker path="/settings/subscription" :label="i18n.ts._hana._subscription.premium" :keywords="['subscription', 'premium']" icon="ti ti-device-desktop-star">
	<div class="_gaps_m" :class="$style.root">
		<SearchMarker :keywords="['subscription', 'current', 'plan']">
			<div :class="$style.currentPlanRoot" :style="{ background: `var(--HNM_G-${planSlug}, #555)` }">
				<div :class="$style.currentPlanText" class="_gaps">
					<div>
						<div :class="$style.currentPlanSub"><SearchLabel>{{ i18n.ts._hana._subscription.currentPlan }}</SearchLabel></div>
						<div :class="$style.currentPlanTitle">{{ currentPlanLoading ? i18n.ts.loading : currentPlan?.plan.displayName ?? i18n.ts._hana._subscription.none }}</div>
					</div>
					<div>
						<div :class="$style.currentPlanSub">{{ i18n.ts._hana._subscription.nextBillingDate }}</div>
						<div :class="$style.currentPlanNextBilling">-</div>
					</div>
					<div class="_buttons">
						<MkButton rounded link to="/premium" style="background: #fff; font-weight: 700; color: var(--MI_THEME-accent) !important;">{{ planSlug == null ? i18n.ts._hana._subscription.join : i18n.ts._hana._subscription.changePlan }}</MkButton>
						<MkButton v-if="planSlug != null" rounded danger style="background: #fff;" @click="cancelSubscription">{{ i18n.ts._hana._subscription.cancelSubscription }}</MkButton>
					</div>
				</div>
				<div :class="$style.currentPlanImage">
					<img
						v-if="planSlug != null && !imageLoadFailed"
						ref="imageEl"
						:src="`https://static-assets.misskey.flowers/misc/premium/plan-kv/${planSlug}.png`"
						:alt="planName ?? 'Free Plan'"
					/>
				</div>
			</div>
		</SearchMarker>
		<FormLink to="/premium">
			<template #icon>
				<i class="ti ti-list-search"></i>
			</template>
			{{ i18n.ts._hana._subscription.goToIntroductionPage }}
		</FormLink>
		<FormSection>
			<template #label>
				<SearchLabel>{{ i18n.ts._hana._subscription.manage }}</SearchLabel>
			</template>
			<div class="_gaps_s">
				<FormLink @click="initiateCustomerPortal">
					<template #icon>
						<i class="ti ti-wallet"></i>
					</template>
					{{ i18n.ts._hana._subscription.configurePaymentMethod }}
				</FormLink>
			</div>
		</FormSection>
	</div>
</SearchMarker>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch, onBeforeUnmount, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';

import MkButton from '@/components/MkButton.vue';
import FormLink from '@/components/form/link.vue';
import FormSection from '@/components/form/section.vue';

import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { waiting, alert as osAlert } from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { planConfirm } from '@/hana/scripts/subscription.js';

const currentPlanLoading = ref(true);
const currentPlan = ref<Misskey.entities.PremiumStatusResponse['subscription']>(null);
const planSlug = computed(() => currentPlan.value?.plan.slug ?? null);
const planName = computed(() => currentPlan.value?.plan.displayName ?? null);
const imageEl = useTemplateRef('imageEl');
const imageLoadFailed = ref(false);

function onImageLoad() {
	if (imageEl.value == null) return;
	if (imageEl.value.naturalWidth === 0) {
		imageLoadFailed.value = true;
	}
}

const imageElWatchStop = watch(imageEl, (el) => {
	if (el == null) return;
	if (el.complete) {
		if (el.naturalWidth === 0) {
			imageLoadFailed.value = true;
		}
	} else {
		el.addEventListener('load', onImageLoad);
	}
	imageElWatchStop();
}, { immediate: true });

watch(planSlug, () => {
	imageLoadFailed.value = false;
});

async function initiateCustomerPortal() {
	const hide = waiting();
	const res = await misskeyApi('premium/portal', {
		returnUrl: `${window.location.origin}/settings/subscription`,
	}).catch(() => null);

	if (res?.url) {
		location.href = res.url;
	} else {
		hide();
		osAlert({
			type: 'error',
			title: i18n.ts._hana._subscription.failedToInitiateCustomersPortal,
			text: i18n.ts._hana._subscription.failedDescription,
		});
	}
}

async function cancelSubscription() {
	const hide = waiting();
	const res = await misskeyApi('premium/cancel/preview', {
		immediate: false,
	}).catch(() => null);

	if (res != null) {
		hide();
		const planConfirmRes = await planConfirm({
			currentPlan: currentPlan.value,
			planChange: {
				type: 'cancel',
				sessionId: res.sessionId,
				preview: res.preview,
			},
		});

		if (planConfirmRes.canceled) return;
		const hideCancel = waiting();
		const cancelRes = await misskeyApi('premium/cancel/execute', {
			sessionId: planConfirmRes.newSessionId ?? res.sessionId,
			immediate: planConfirmRes.cancelImmediately,
		}).catch(() => 'ERROR');

		if (cancelRes !== 'ERROR') {
			hideCancel({ success: true });
		} else {
			hideCancel();
			osAlert({
				type: 'error',
				title: i18n.ts._hana._subscription.failedToProcess,
				text: i18n.ts._hana._subscription.failedDescription,
			});
		}
	} else {
		hide();
		osAlert({
			type: 'error',
			title: i18n.ts._hana._subscription.failedToProcess,
			text: i18n.ts._hana._subscription.failedDescription,
		});
	}
}

onMounted(async () => {
	const res = await misskeyApi('premium/status').catch(() => null);
	currentPlan.value = res?.subscription ?? null;
	currentPlanLoading.value = false;
});

onBeforeUnmount(() => {
	const el = imageEl.value;
	if (el == null) return;
	el.removeEventListener('load', onImageLoad);
});

definePage(() => ({
	title: i18n.ts._hana._subscription.premium,
	icon: 'ti ti-device-desktop-star',
}));
</script>

<style module>
.root {
	container-type: inline-size;
}

.currentPlanRoot {
	box-sizing: border-box;
	display: grid;
	gap: 1rem;
	overflow: clip;
	border-radius: var(--MI-radius);
	padding: 0 calc(var(--MI-margin) * 2);
}

.currentPlanImage {
	box-sizing: border-box;
	margin-bottom: -10%;
}

.currentPlanImage img {
	display: block;
	width: 100%;
	max-width: 50%;
	height: 100%;
	margin: 0 auto;
	object-fit: contain;
	object-position: bottom center;
}

.currentPlanText {
	box-sizing: border-box;
	padding: calc(var(--MI-margin) * 2) 0;
	color: white;
}

.currentPlanSub {
	font-size: 0.9rem;
	margin-bottom: 0.1rem;
}

.currentPlanTitle {
	font-size: 1.5rem;
	font-weight: bold;
}

.currentPlanNextBilling {
	font-size: 1.2rem;
}

@container (min-width: 450px) {
	.currentPlanRoot {
		grid-template-columns: 1fr minmax(auto, 40%);
		padding: 0 0 0 calc(var(--MI-margin) * 1.25);
	}

	.currentPlanImage {
		padding-top: calc(var(--MI-margin) * 1.25);
	}

	.currentPlanImage img {
		margin-left: auto;
		margin-right: 0;
		max-width: none;
	}

	.currentPlanText {
		padding: calc(var(--MI-margin) * 1.25) 0;
	}

	.currentPlanTitle {
		font-size: 2rem;
	}
}
</style>
