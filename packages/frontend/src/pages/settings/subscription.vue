<template>
<div class="_gaps_m">
	<div class="_gaps_s">
		<MkKeyValue>
			<template #key>{{ i18n.ts.subscriptionStatus }}</template>
			<template #value>{{ i18n.t(`_subscription.${subscriptionStatus}`) }}</template>
		</MkKeyValue>
	</div>
	<FormPagination ref="list" :pagination="pagination">
		<template #empty>
			<div class="_fullinfo">
				<img :src="infoImageUrl" class="_ghost"/>
				<div>{{ i18n.ts.nothing }}</div>
			</div>
		</template>
		<template #default="{items}">
			<div class="_gaps">
				<div v-for="plan in items" :key="plan.id" class="_panel" :class="$style.plan">
					<div :class="$style.planBody">
						<div :class="$style.planName">{{ plan.name + (plan.id === currentPlan ? (' (' + i18n.ts._subscription.current + ')') : '') }}</div>
						<div>{{ plan.description }}</div>
						<MkKeyValue oneline>
							<template #key>{{ i18n.ts._subscription.price }}</template>
							<template #value>{{ plan.price + ' ' + plan.currency }}</template>
						</MkKeyValue>
						<div>
							<MkButton v-if="canSubscribe && !plan.isArchived" primary :class="$style.button" @click="subscribe(plan)"><i class="ti ti-plus"></i> {{ i18n.ts._subscription.subscribe }}</MkButton>
							<MkButton v-else-if="plan.id === currentPlan" :class="$style.button" @click="manage()"><i class="ti ti-settings"></i> {{ i18n.ts._subscription.manage }}</MkButton>
							<MkButton v-else-if="!plan.isArchived" :class="$style.button" @click="change(plan)"><i class="ti ti-reload"></i> {{ i18n.ts._subscription.changePlan }}</MkButton>
						</div>
					</div>
				</div>
				<div class="_gaps_s">
					<MkButton @click="refresh()"><i class="ti ti-reload"></i> {{ i18n.ts._subscription.refresh }}</MkButton>
					<div :class="$style.caption">{{ i18n.ts._subscription.refreshDescription }}</div>
				</div>
			</div>
		</template>
	</FormPagination>
</div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { i18n } from '@/i18n.js';
import { $i } from '@/account.js';
import * as os from '@/os.js';
import FormSection from '@/components/form/section.vue';
import { infoImageUrl } from '@/instance.js';
import MkKeyValue from '@/components/MkKeyValue.vue';
import FormPagination from '@/components/MkPagination.vue';
import MkButton from '@/components/MkButton.vue';
import { definePageMetadata } from '@/scripts/page-metadata.js';

const list = ref<InstanceType<typeof FormPagination>>();
const subscriptionStatus = computed(() => $i.subscriptionStatus);
const currentPlan = computed(() => $i.subscriptionPlanId);
const canSubscribe = computed(() => subscriptionStatus.value === 'incomplete_expired' || currentPlan.value === null);

const pagination = {
	endpoint: 'subscription-plans/list' as const,
	limit: 10,
	noPaging: true,
};

async function subscribe(plan) {
	const redirect = await os.apiWithDialog('subscription/create', { planId: plan.id });
	if (redirect) {
		location.href = redirect.redirect.destination;
	}
}

async function manage() {
	const redirect = await os.apiWithDialog('i/customer-portal');
	if (redirect) {
		location.href = redirect.redirect.destination;
	}
}

function change(plan) {
	os.confirm({
		title: i18n.ts._subscription.confirmChangePlan,
		type: 'question',
	}).then((res) => {
		if (res.canceled) return;
		os.apiWithDialog('i/register-subscription', {
			planId: plan.id,
		});
	}).then(() => {
		setTimeout(() => {
			location.reload();
		}, 1000);
	});
}

function refresh() {
	os.apiWithDialog('subscription/refresh');
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePageMetadata({
	title: i18n.ts.subscription,
	icon: 'ti ti-credit-card',
});
</script>

<style lang="scss" module>
.plan {
	display: flex;
	padding: 16px;
}

.planName {
	font-weight: bold;
}

.planBody {
	width: calc(100% - 62px);
	position: relative;
}

.button {
	margin: 8px 0;
}

.caption {
	font-size: 0.85em;
	color: var(--fgTransparentWeak);
}
</style>
