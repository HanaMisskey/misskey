<template>
<SearchMarker path="/settings/subscription" :label="i18n.ts._hana._subscription.premium" :keywords="['subscription', 'premium']" icon="ti ti-device-desktop-star">
	<div class="_gaps_m" :class="$style.root">
		<SearchMarker :keywords="['subscription', 'current', 'plan']">
			<div :class="$style.currentPlanRoot">
				<div :class="$style.currentPlanText" class="_gaps">
					<div>
						<div :class="$style.currentPlanSub"><SearchLabel>{{ i18n.ts._hana._subscription.currentPlan }}</SearchLabel></div>
						<div :class="$style.currentPlanTitle">{{ i18n.ts._hana._subscription.none }}</div>
					</div>
					<div>
						<div :class="$style.currentPlanSub">{{ i18n.ts._hana._subscription.nextBillingDate }}</div>
						<div :class="$style.currentPlanNextBilling">-</div>
					</div>
					<div class="_buttons">
						<MkButton rounded link to="/premium" style="background: #fff; font-weight: 700; color: var(--MI_THEME-accent) !important;">{{ i18n.ts._hana._subscription.changePlan }}</MkButton>
						<MkButton rounded danger style="background: #fff;">{{ i18n.ts._hana._subscription.cancelSubscription }}</MkButton>
					</div>
				</div>
				<div :class="$style.currentPlanImage">
					<img src="https://premium-lp.hanami-lp.pages.dev/premium/ch.png" />
				</div>
			</div>
		</SearchMarker>
		<FormLink to="/premium">
			<template #icon>
				<i class="ti ti-list-search"></i>
			</template>
			{{ i18n.ts._hana._subscription.goToIntroductionPage }}
		</FormLink>
	</div>
</SearchMarker>
</template>

<script setup lang="ts">
import MkButton from '@/components/MkButton.vue';
import FormLink from '@/components/form/link.vue';

import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';

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
	background: linear-gradient(135deg, #fdb272, #fd779e);
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
		margin-bottom: -20%;
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
