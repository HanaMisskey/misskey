<template>
<MkModal ref="modal" :preferType="'dialog'" :zPriority="'high'" @click="onBackdropClick" @closed="emit('closed')">
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
				<div v-if="previewLoading" :class="$style.planChangeLoadingRoot"><MkLoading /></div>
			</div>
			<div v-if="operationDescription != null" :class="$style.operationDescription">{{ operationDescription }}</div>
			<div v-if="planChange.type === 'cancel'">
				<MkSwitch v-model="cancelImmediately" :disabled="previewLoading">
					{{ i18n.ts._hana._subscription.cancelImmediately }}
					<template #caption>
						{{ i18n.ts._hana._subscription.cancelImmediatelyDescription }}
					</template>
				</MkSwitch>
			</div>
		</div>
		<FormSlot>
			<div :class="$style.buttons">
				<MkButton inline rounded :disabled="previewLoading" @click="cancel">{{ i18n.ts.cancel }}</MkButton>
				<MkButton inline primary rounded :disabled="previewLoading" @click="ok">{{ okText }}</MkButton>
			</div>
			<template #caption>
				<div :class="$style.buttonsSub">{{ i18n.ts._hana._subscription.termsAndConditionsApply }}</div>
			</template>
		</FormSlot>
	</div>
</MkModal>
</template>

<script lang="ts">
export type HanaSubscriptionConfirmDialogDoneEvent = {
	canceled: true;
} | {
	canceled: false;
	newSessionId: string | null; // 変わった場合のみ
	cancelImmediately: boolean;
};
export type HanaSubscriptionConfirmDialogProps = {
	currentPlan: Misskey.entities.PremiumStatusResponse['subscription'];
	planChange: {
		type: 'change';
		preview: Misskey.entities.PremiumSubscribePreviewResponse['preview'];
	} | {
		type: 'cancel';
		sessionId: string;
		preview: Misskey.entities.PremiumCancelPreviewResponse['preview'];
	};
};
</script>

<script lang="ts" setup>
import { onBeforeUnmount, onMounted, useTemplateRef, computed, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { dateString } from '@/filters/date.js';
import MkModal from '@/components/MkModal.vue';
import MkButton from '@/components/MkButton.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import FormSlot from '@/components/form/slot.vue';
import XPlan from './HanaSubscriptionConfirmDialog.plan.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';

const props = defineProps<HanaSubscriptionConfirmDialogProps>();

const emit = defineEmits<{
	(ev: 'done', v: HanaSubscriptionConfirmDialogDoneEvent): void;
	(ev: 'closed'): void;
}>();

const modal = useTemplateRef('modal');
const previewLoading = ref(false);
const cancelPreview = ref<Misskey.entities.PremiumCancelPreviewResponse['preview'] | null>(
	props.planChange.type === 'cancel' ? props.planChange.preview : null,
);
const currentSessionId = ref<string | null>(props.planChange.type === 'cancel' ? props.planChange.sessionId : null);
const newSessionId = ref<string | null>(null);
const suppressPreviewRefresh = ref(false);

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
			const effectiveAt = cancelPreview.value?.effectiveAt ?? props.planChange.preview.effectiveAt;
			return i18n.tsx._hana._subscription.newPlanFromX({ x: dateString(effectiveAt) });
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
	if (plan == null || plan.plan == null) return null;
	return {
		slug: plan.plan.slug,
		planName: plan.plan.displayName,
	};
}

function getPlanObjFromPreviewPlan(preview: Misskey.entities.PremiumSubscribePreviewResponse['preview']): { slug: string; planName: string } | null {
	switch (preview.type) {
		case 'subscribe':
			return {
				slug: preview.newPlan.slug,
				planName: preview.newPlan.displayName,
			};
		case 'upgrade':
		case 'downgrade':
			return {
				slug: preview.newPlan.slug,
				planName: preview.newPlan.displayName,
			};
		case 'cancel_downgrade':
			return {
				slug: preview.pendingDowngradePlan.slug,
				planName: preview.pendingDowngradePlan.displayName,
			};
		default:
			return null;
	}
}

const cancelImmediately = ref(false);

watch(cancelImmediately, async (value, oldValue) => {
	if (props.planChange.type !== 'cancel') return;
	if (suppressPreviewRefresh.value) {
		suppressPreviewRefresh.value = false;
		return;
	}
	previewLoading.value = true;

	const res = await misskeyApi('premium/cancel/preview', {
		immediate: value,
	}).catch(() => null);

	previewLoading.value = false;
	if (!res) {
		suppressPreviewRefresh.value = true;
		cancelImmediately.value = oldValue;
		return;
	}

	cancelPreview.value = res.preview;
	if (res.sessionId !== currentSessionId.value) {
		currentSessionId.value = res.sessionId;
		newSessionId.value = res.sessionId;
	}
});

// overload function を使いたいので lint エラーを無視する
function done(canceled: true): void;
function done(canceled: false, cancelImmediately: boolean): void; // eslint-disable-line no-redeclare

function done(canceled: boolean, cancelImmediately?: boolean): void { // eslint-disable-line no-redeclare
	if (canceled) {
		emit('done', { canceled: true });
	} else {
		emit('done', {
			canceled: false,
			newSessionId: newSessionId.value,
			cancelImmediately: cancelImmediately ?? false,
		});
	}
	modal.value?.close();
}

async function ok() {
	if (previewLoading.value) return;
	done(false, cancelImmediately.value);
}

function cancel() {
	if (previewLoading.value) return;
	done(true);
}

function onBackdropClick() {
	if (previewLoading.value) return;
	done(true);
}

function onKeydown(evt: KeyboardEvent) {
	if (previewLoading.value) return;
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
	position: relative;
	overflow: clip;
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

.planChangeLoadingRoot {
	position: absolute;
	inset: 0;
	background: rgba(255, 255, 255, 0.7);
	display: flex;
	align-items: center;
	justify-content: center;
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
