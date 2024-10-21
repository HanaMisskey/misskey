<template>
<div class="_gaps_m">
	<div class="_gaps_s">
		<MkKeyValue>
			<template #key>{{ i18n.ts._hana.subscriptionStatus }}</template>
			<template #value>{{ i18n.ts._hana._subscription[subscriptionStatus] }}</template>
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
						<div :class="$style.planName">{{ plan.name + (plan.id === currentPlan ? (' (' + i18n.ts._hana._subscription.current + ')') : '') }}</div>
						<div>{{ plan.description }}</div>
						<MkKeyValue oneline>
							<template #key>{{ i18n.ts._hana._subscription.price }}</template>
							<template #value>{{ plan.price + ' ' + plan.currency }}</template>
						</MkKeyValue>
						<div>
							<MkButton v-if="canSubscribe && !plan.isArchived" primary :class="$style.button" @click="subscribe(plan)"><i class="ti ti-plus"></i> {{ i18n.ts._hana._subscription.subscribe }}</MkButton>
							<MkButton v-else-if="plan.id === currentPlan" :class="$style.button" @click="manage()"><i class="ti ti-settings"></i> {{ i18n.ts._hana._subscription.manage }}</MkButton>
							<MkButton v-else-if="!plan.isArchived" :class="$style.button" @click="change(plan)"><i class="ti ti-reload"></i> {{ i18n.ts._hana._subscription.changePlan }}</MkButton>
						</div>
					</div>
				</div>
			</div>
		</template>
	</FormPagination>
</div>
</template>

<script lang="ts" setup>
import { computed, ref, defineAsyncComponent } from 'vue';
import { i18n } from '@/i18n.js';
import { $i } from '@/account.js';
import * as os from '@/os.js';
import FormSection from '@/components/form/section.vue';
import { infoImageUrl } from '@/instance.js';
import MkKeyValue from '@/components/MkKeyValue.vue';
import FormPagination from '@/components/MkPagination.vue';
import MkButton from '@/components/MkButton.vue';
import { definePageMetadata } from '@/scripts/page-metadata.js';
import { misskeyApi } from '@/scripts/misskey-api.js';

const list = ref<InstanceType<typeof FormPagination>>();
const subscriptionStatus = computed(() => $i?.subscriptionStatus ?? 'none');
const currentPlan = computed(() => $i?.subscriptionPlanId ?? null);
const canSubscribe = computed(() => subscriptionStatus.value === 'incomplete_expired' || currentPlan.value === null);

const pagination = {
	endpoint: 'subscription-plans/list' as const,
	limit: 10,
	noPaging: true,
};

async function subscribe(plan) {
	const showing = ref(true);
	const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkWaitingDialog.vue')), {
		success: false,
		showing: showing,
	}, {
		closed: () => dispose(),
	});

	misskeyApi('subscription/create', { planId: plan.id }).then((res) => {
		location.href = res.redirect.destination;
	}).catch(() => {
		showing.value = false;
	});
}

async function manage() {
	const showing = ref(true);
	const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkWaitingDialog.vue')), {
		success: false,
		showing: showing,
	}, {
		closed: () => dispose(),
	});

	misskeyApi('subscription/manage').then((res) => {
		location.href = res.redirect.destination;
	}).catch(() => {
		showing.value = false;
	});
}

function change(plan) {
	os.confirm({
		title: i18n.ts._hana._subscription.confirmChangePlan,
		type: 'question',
	}).then((res) => {
		if (res.canceled) return;
		os.apiWithDialog('subscription/create', {
			planId: plan.id,
		});
	}).then(() => {
		setTimeout(() => {
			location.reload();
		}, 1000);
	});
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePageMetadata({
	title: i18n.ts._hana.subscription,
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
