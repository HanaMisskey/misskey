<template>
<div :class="$style.root">
	<MkInfo v-if="paginator.needsRefresh.value" role="status">{{ i18n.ts._hanamiRecommendations.refreshRequired }}</MkInfo>
	<MkInfo v-if="feedbackFailed" warn role="alert">{{ i18n.ts._hanamiRecommendations.feedbackFailed }}</MkInfo>
	<MkNotesTimeline :paginator="paginator" :withControl="false" :noGap="true" :withDateSeparators="false">
		<template #note="{ note, noteProps }">
			<div :ref="element => observe(element, note.recommendationEvent)">
				<MkNote v-bind="noteProps" :note="note" :additionalMenuItems="() => getAdjustmentMenu(note)"/>
			</div>
		</template>
	</MkNotesTimeline>
</div>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, provide, ref, watch } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import type * as Misskey from 'misskey-js';
import type { HanamiDisplayEvent } from '@/utility/hanami-impressions.js';
import type { HanamiRecommendationNote } from '@/hana/scripts/hanami-recommendation-paginator.js';
import type { MenuItem } from '@/types/menu.js';
import MkNote from '@/components/MkNote.vue';
import MkNotesTimeline from '@/components/MkNotesTimeline.vue';
import MkInfo from '@/components/MkInfo.vue';
import { HanamiRecommendationPaginator } from '@/hana/scripts/hanami-recommendation-paginator.js';
import { DI } from '@/di.js';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { createHanamiImpressionTracker } from '@/utility/hanami-impressions.js';
import { beginHanamiOperation, observeHanamiViewport, flushHanamiObservations, subscribeHanamiObservations } from '@/utility/hanami-interactions.js';
import type { HanamiOperationHandle } from '@/utility/hanami-observation-windows.js';

type Feedback = Misskey.Endpoints['hanami-feedback']['req'];
const props = defineProps<{
	withFiles: boolean;
}>();
const paginator = new HanamiRecommendationPaginator(() => props.withFiles);
const feedbackFailed = ref(false);
let disposed = false;
let tracker: ReturnType<typeof createHanamiImpressionTracker> | undefined;
const observed = new Map<string, Element>();
let leaving = false;
const expiredSnapshots = new Set<string>();
const unsubscribeObservations = subscribeHanamiObservations({
	onAccepted: () => {
		if (disposed) return;
		tracker?.resume();
	},
	onExpired: snapshotIds => {
		if (disposed || !paginator.items.value.some(item => snapshotIds.includes(item.recommendationEvent.snapshotId))) return;
		for (const id of snapshotIds) expiredSnapshots.add(id);
		for (const element of observed.values()) tracker?.unobserve(element);
		observed.clear();
		paginator.requireRefresh();
	},
});
const pendingFeedback = new Map<string, { request: Feedback; operation: HanamiOperationHandle }>();
provide(DI.noteCaptureHttpOnly, true);

function resumeObservations() {
	tracker?.resume();
}

function refresh() { resumeObservations(); return paginator.reload(); }

function visibilityChanged() {
	if (!window.document.hidden && window.document.visibilityState === 'visible') {
		resumeObservations();
		void paginator.init();
	} else { void flushImpressions(); }
}

function observe(element: Element | ComponentPublicInstance | null, event: HanamiDisplayEvent) {
	const previous = observed.get(event.eventId);
	if (previous === element) return;
	if (previous) {
		tracker?.unobserve(previous);
		observed.delete(event.eventId);
	}
	if (!(element instanceof Element)) return;
	observed.set(event.eventId, element);
	tracker?.observe(element, event);
}

function flushImpressions() { return flushHanamiObservations(); }

function pagehide() {
	if (leaving) return;
	leaving = true;
	void flushImpressions();
}

function pageshow() {
	leaving = false;
	resumeObservations();
}

function getAdjustmentMenu(item: HanamiRecommendationNote): MenuItem[] {
	const menu: MenuItem[] = [];
	const add = (target: Feedback['target'], labels: string[]) => {
		(['more', 'less', 'reset'] as const).forEach((action, index) => {
			const key = JSON.stringify([item.recommendationEvent.snapshotId, item.recommendationEvent.entryId, target, action]);
			const request: Feedback = pendingFeedback.get(key)?.request ?? { eventId: crypto.randomUUID(), target, action, snapshotId: item.recommendationEvent.snapshotId, entryId: item.recommendationEvent.entryId };
			menu.push({ text: labels[index], action: async () => {
				feedbackFailed.value = false;
				const operation = pendingFeedback.get(key)?.operation ?? beginHanamiOperation(item.recommendationEvent);
				pendingFeedback.set(key, { request, operation });
				try {
					await misskeyApi('hanami-feedback', request);
					operation.succeededFeedback(request.eventId);
					pendingFeedback.delete(key);
					paginator.requireRefresh();
				} catch { operation.uncertain(); feedbackFailed.value = true; }
			} });
		});
	};
	const locale = i18n.ts._hanamiRecommendations;
	add({ kind: 'author', id: item.userId }, [locale.authorMore, locale.authorLess, locale.authorReset]);
	for (const tag of item.tags ?? []) add({ kind: 'tag', id: tag }, [
		i18n.tsx._hanamiRecommendations.tagMore({ tag }), i18n.tsx._hanamiRecommendations.tagLess({ tag }), i18n.tsx._hanamiRecommendations.tagReset({ tag }),
	]);
	if (item.text?.trim() || item.cw?.trim()) add({ kind: 'note', id: item.id }, [locale.noteMore, locale.noteLess, locale.noteReset]);
	return [{ type: 'parent', text: locale.adjust, icon: 'ti ti-adjustments-horizontal', children: menu }];
}

watch(() => props.withFiles, () => void refresh());
onMounted(() => {
	tracker = createHanamiImpressionTracker({ onObservation: record => {
		const position = paginator.items.value.findIndex(item => item.recommendationEvent.snapshotId === record.snapshotId && item.recommendationEvent.entryId === record.entryId) + 1;
		return !expiredSnapshots.has(record.snapshotId) && observeHanamiViewport(record, position);
	} });
	window.addEventListener('pagehide', pagehide);
	window.addEventListener('pageshow', pageshow);
	window.document.addEventListener('visibilitychange', visibilityChanged);
});
onUnmounted(() => {
	paginator.dispose();
	tracker?.disconnect();
	if (!leaving) void flushImpressions();
	disposed = true;
	unsubscribeObservations();
	window.removeEventListener('pagehide', pagehide);
	window.removeEventListener('pageshow', pageshow);
	window.document.removeEventListener('visibilitychange', visibilityChanged);
});
defineExpose({ refresh });
</script>

<style lang="scss" module>
.root {
	background: var(--MI_THEME-bg);
	border-radius: var(--MI-radius);
	overflow: clip;
}
</style>
