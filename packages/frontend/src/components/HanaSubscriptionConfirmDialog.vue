<template>
<MkModal ref="modal" :preferType="'dialog'" :zPriority="'high'" @click="done(true)" @closed="emit('closed')">
	<div :class="$style.root" class="_gaps">
		<div class="_gaps_s">
			<div :class="$style.header">
				<div :class="$style.icon">
					<i class="ti ti-help-circle"></i>
				</div>
				<div :class="$style.title">{{ title }}</div>
			</div>
			<div v-panel class="_panel _gaps_s" :class="$style.planChangeRoot">
				<div :class="$style.planChangeHeading">{{ planChangeHeading }}</div>
				<div :class="$style.planChangeGrid">
					<XPlan :plan="getPlanObjFromCurrentPlan(currentPlan)" />
					<div :class="$style.planChangeArrow">
						<i class="ti ti-arrow-right"></i>
					</div>
					<XPlan :plan="planChange.type === 'cancel' ? null : getPlanObjFromPreviewPlan(planChange.preview)" />
				</div>
			</div>
			<div v-if="operationDescription != null" :class="$style.operationDescription">{{ operationDescription }}</div>
			<div v-if="planChange.type === 'cancel'">
				<MkSwitch v-model="cancelImmediately">
					{{ i18n.ts._hana._subscription.cancelImmediately }}
					<template #caption>
						{{ i18n.ts._hana._subscription.cancelImmediatelyDescription }}
					</template>
				</MkSwitch>
			</div>
		</div>
		<FormSlot>
			<div :class="$style.buttons">
				<MkButton inline rounded @click="cancel">{{ i18n.ts.cancel }}</MkButton>
				<MkButton inline primary rounded @click="ok">{{ okText }}</MkButton>
			</div>
			<template #caption>
				<div :class="$style.buttonsSub">{{ i18n.ts._hana._subscription.termsAndConditionsApply }}</div>
			</template>
		</FormSlot>
	</div>
</MkModal>
</template>

<script lang="ts">
export type HanaSubscriptionConfirmDialogDoneEvent = { canceled: true } | { canceled: false, cancelImmediately: boolean };
export type HanaSubscriptionConfirmDialogProps = {
	currentPlan: Misskey.entities.PremiumStatusResponse['subscription'];
	planChange: {
		type: 'change';
		preview: Misskey.entities.PremiumSubscribePreviewResponse['preview'];
	} | {
		type: 'cancel';
		preview: Misskey.entities.PremiumCancelPreviewResponse['preview'];
	};
};
</script>

<script lang="ts" setup>
import { onBeforeUnmount, onMounted, shallowRef, computed, ref } from 'vue';
import * as Misskey from 'misskey-js';
import { dateString } from '@/filters/date.js';
import MkModal from '@/components/MkModal.vue';
import MkButton from '@/components/MkButton.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import FormSlot from '@/components/form/slot.vue';
import XPlan from './HanaSubscriptionConfirmDialog.plan.vue';
import { i18n } from '@/i18n.js';

const props = defineProps<HanaSubscriptionConfirmDialogProps>();

const emit = defineEmits<{
	(ev: 'done', v: HanaSubscriptionConfirmDialogDoneEvent): void;
	(ev: 'closed'): void;
}>();

const modal = shallowRef<InstanceType<typeof MkModal>>();

const title = computed(() => {
	if (props.planChange.type === 'cancel') {
		return i18n.ts._hana._subscription.cancelConfirm;
	} else {
		switch (props.planChange.preview.type) {
			case 'upgrade':
			case 'downgrade':
				return i18n.ts._hana._subscription.planChangeConfirm;
			case 'subscribe':
				return i18n.ts._hana._subscription.planNewConfirm;
			default:
				return '';
		}
	}
});

const operationDescription = computed(() => {
	if (props.planChange.type === 'cancel') {
		return i18n.ts._hana._subscription.cancelDescription;
	} else {
		switch (props.planChange.preview.type) {
			case 'upgrade':
				return i18n.ts._hana._subscription.upgradeDescription;
			case 'downgrade':
				return i18n.ts._hana._subscription.downgradeDescription;
			case 'subscribe':
				return i18n.ts._hana._subscription.newDescription;
			default:
				return null;
		}
	}
});

const okText = computed(() => {
	if (props.planChange.type === 'cancel') {
		return i18n.ts._hana._subscription.cancelOk;
	} else {
		switch (props.planChange.preview.type) {
			case 'subscribe':
				return i18n.ts._hana._subscription.planNewOk;
			default:
				return i18n.ts._hana._subscription.planChangeOk;
		}
	}
});

const planChangeHeading = computed(() => {
	if (props.planChange.type === 'cancel') {
		if (cancelImmediately.value) {
			return i18n.ts._hana._subscription.newPlanFromToday;
		} else {
			return i18n.tsx._hana._subscription.newPlanFromX({ x: dateString(props.planChange.preview.effectiveAt) });
		}
	} else {
		switch (props.planChange.preview.type) {
			case 'upgrade':
			case 'subscribe':
			case 'cancel_downgrade':
				return i18n.ts._hana._subscription.newPlanFromToday;
			case 'downgrade':
				return i18n.tsx._hana._subscription.newPlanFromX({ x: dateString(props.planChange.preview.effectiveAt) });
			default:
				return null;
		}
	}
});

function getPlanObjFromCurrentPlan(plan: Misskey.entities.PremiumStatusResponse['subscription']): { slug: string; planName: string } | null {
	if (!plan) return null;
	return {
		slug: plan.plan.slug,
		planName: plan.plan.displayName,
	};
}

function getPlanObjFromPreviewPlan(preview: Misskey.entities.PremiumSubscribePreviewResponse['preview']): { slug: string; planName: string } | null {
	switch (preview.type) {
		case 'subscribe':
			return {
				slug: preview.targetPlanSlug,
				planName: preview.targetPlanDisplayName,
			};
		case 'upgrade':
		case 'downgrade':
			return {
				slug: preview.newPlanSlug,
				// @ts-expect-error TODO
				planName: preview.newPlanDisplayName ?? 'TODO',
			};
		case 'cancel_downgrade':
			return {
				slug: preview.pendingDowngradeTargetSlug,
				// @ts-expect-error TODO
				planName: preview.pendingDowngradeTargetDisplayName ?? 'TODO',
			};
		default:
			return null;
	}
}

const cancelImmediately = ref(false);

// overload function を使いたいので lint エラーを無視する
function done(canceled: true): void;
function done(canceled: false, cancelImmediately: boolean): void; // eslint-disable-line no-redeclare

function done(canceled: boolean, cancelImmediately?: boolean): void { // eslint-disable-line no-redeclare
	emit('done', { canceled, cancelImmediately } as HanaSubscriptionConfirmDialogDoneEvent);
	modal.value?.close();
}

async function ok() {
	done(false, cancelImmediately.value);
}

function cancel() {
	done(true);
}

function onKeydown(evt: KeyboardEvent) {
	if (evt.key === 'Escape') cancel();
}

onMounted(() => {
	window.document.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
	window.document.removeEventListener('keydown', onKeydown);
});
</script>

<style lang="scss" module>
.root {
	container-type: inline-size;
	position: relative;
	margin: auto;
	padding: 24px;
	width: 100%;
	min-width: 320px;
	max-width: 480px;
	box-sizing: border-box;
	background: var(--MI_THEME-panel);
	border-radius: 16px;
}

.header {
	display: flex;
	align-items: center;
	gap: 0.75em;
}

.icon {
	font-size: 18px;
}

.title {
	font-weight: bold;
	font-size: 1.1em;
}

.planChangeRoot {
	padding: var(--MI-margin);
}

.planChangeHeading {
	text-align: center;
	font-weight: bold;
	font-size: 0.95em;
}

.planChangeGrid {
	display: grid;
	grid-template-columns: 1fr auto 1fr;
	align-items: center;
	gap: 16px;
	font-size: 0.75em;
}

@container (min-width: 350px) {
	.planChangeGrid {
		font-size: 1em;
	}

	.root {
		padding: 32px;
	}
}

.planChangeArrow {
	text-align: center;
	font-size: 18px;
}

.operationDescription {
	font-size: 0.95em;
}

.buttons {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
	justify-content: center;
}

.buttonsSub {
	text-align: center;
}
</style>
