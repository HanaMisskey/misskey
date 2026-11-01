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
import type { HanamiDisplayEvent, HanamiObservation } from '@/utility/hanami-impressions.js';
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

type Feedback = Misskey.Endpoints['hanami-feedback']['req'];
const props = defineProps<{
	withFiles: boolean;
}>();
const paginator = new HanamiRecommendationPaginator(() => props.withFiles);
const feedbackFailed = ref(false);
let disposed = false;
let tracker: ReturnType<typeof createHanamiImpressionTracker> | undefined;
const observed = new Map<string, Element>();
const observations: HanamiObservation[] = [];
let retryBatch: HanamiObservation[] | undefined;
let writeFailed = false;
let flushTimer: number | undefined;
let leaving = false;
const expiredSnapshots = new Set<string>();
let writing = false;
let terminalFlushPending = false;
const pendingFeedback = new Map<string, Feedback>();
provide(DI.noteCaptureHttpOnly, true);

function resumeObservations() {
	writeFailed = false;
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

async function flushImpressions(terminal = false) {
	if (writing) {
		terminalFlushPending ||= terminal;
		return;
	}
	if ((!terminal && (disposed || leaving || writeFailed)) || observations.length === 0) return;
	writing = true;
	let acknowledged = false;
	const batch = retryBatch ?? observations.slice(0, 100);
	try {
		const ack = await misskeyApi('hanami-impressions', { version: 2, observations: batch });
		if (!Number.isSafeInteger(ack.accepted) || !Number.isSafeInteger(ack.duplicates) || ack.accepted < 0 || ack.duplicates < 0 || ack.accepted + ack.duplicates !== batch.length || !Array.isArray(ack.completedEventIds) || ack.completedEventIds.some(id => !batch.some(record => record.eventId === id))) throw new Error('Invalid observation acknowledgement');
		observations.splice(0, batch.length);
		retryBatch = undefined;
		tracker?.complete(ack.completedEventIds);
		if (!disposed) tracker?.resume();
		acknowledged = true;
	} catch (error) {
		retryBatch = batch;
		writeFailed = true;
		if (error && typeof error === 'object' && 'code' in error && error.code === 'REFRESH_REQUIRED') {
			for (const record of batch) expiredSnapshots.add(record.snapshotId);
			for (let index = observations.length - 1; index >= 0; index--) {
				if (expiredSnapshots.has(observations[index].snapshotId)) observations.splice(index, 1);
			}
			retryBatch = undefined;
			for (const element of observed.values()) tracker?.unobserve(element);
			observed.clear();
			paginator.requireRefresh();
		}
	} finally {
		const flushPendingTerminal = terminalFlushPending && acknowledged;
		terminalFlushPending = false;
		writing = false;
		if (flushPendingTerminal) void flushImpressions(true);
	}
}

function pagehide() {
	if (leaving) return;
	leaving = true;
	void flushImpressions(true);
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
			const request: Feedback = pendingFeedback.get(key) ?? { eventId: crypto.randomUUID(), target, action, snapshotId: item.recommendationEvent.snapshotId, entryId: item.recommendationEvent.entryId };
			menu.push({ text: labels[index], action: async () => {
				feedbackFailed.value = false;
				pendingFeedback.set(key, request);
				try {
					await misskeyApi('hanami-feedback', request);
					pendingFeedback.delete(key);
					paginator.requireRefresh();
				} catch { feedbackFailed.value = true; }
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
		if (observations.length >= 1000 || expiredSnapshots.has(record.snapshotId)) return false;
		observations.push(record);
		return true;
	} });
	flushTimer = window.setInterval(() => void flushImpressions(), 250);
	window.addEventListener('pagehide', pagehide);
	window.addEventListener('pageshow', pageshow);
	window.document.addEventListener('visibilitychange', visibilityChanged);
});
onUnmounted(() => {
	paginator.dispose();
	tracker?.disconnect();
	if (!leaving) void flushImpressions(true);
	disposed = true;
	window.clearInterval(flushTimer);
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
