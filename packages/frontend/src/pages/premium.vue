<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div ref="rootEl" :class="$style.root">
		<div :class="$style.frameWrapper">
			<iframe
				ref="frameEl"
				:src="frameUrl"
				:class="$style.frame"
				:style="{ height: iframeHeight + 'px' }"
				scrolling="no"
				@load="onFrameLoad"
			></iframe>
		</div>
		<Transition
			:enterActiveClass="$style.transition_x_enterActive"
			:leaveActiveClass="$style.transition_x_leaveActive"
			:enterFromClass="$style.transition_x_enterFrom"
			:leaveToClass="$style.transition_x_leaveTo"
		>
			<div v-if="!iframeLoaded" :class="$style.loader">
				<div :class="$style.loaderInner" class="_gaps">
					<MkLoading/>
				</div>
			</div>
		</Transition>
	</div>
</PageWithHeader>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, onDeactivated, useTemplateRef, ref, computed, watch, toRaw, defineAsyncComponent } from 'vue';
import * as Misskey from 'misskey-js';
import { instance } from '@/instance.js';
import { miLocalStorage } from '@/local-storage.js';
import { store } from '@/store.js';
import { useRouter } from '@/router.js';
import { definePage } from '@/page.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { alert as osAlert, waiting } from '@/os.js';
import { planConfirm } from '@/hana/scripts/subscription.js';

const devFlag = _DEV_ ? '?debug' : '';
const origin = _DEV_ ? 'http://localhost:4321' : 'https://premium-lp.hanami-lp.pages.dev'; // ← マージ前にもとに戻す！！！
const lpTier = ['hana', 'dango', 'bluesheet', 'ozashiki'] as const;

const lang = miLocalStorage.getItem('lang')?.includes('ja') ? 'ja' : 'en';

const frameUrl = `${origin}/${lang}/premium/${devFlag}`;

const frameEl = useTemplateRef('frameEl');
const rootEl = useTemplateRef('rootEl');

const iframeLoaded = ref(false);
const iframeHeight = ref(0);

const currentPlan = ref<Misskey.entities.PremiumStatusResponse['subscription']>(null);

type ButtonState = 'notAvailable' | 'canSubscribe' | 'manage';

const buttonsState = ref<Record<typeof lpTier[number], ButtonState> | null>(null);

async function onFrameLoad() {
	if (!iframeLoaded.value) {
		iframeLoaded.value = true;
	} else if (frameEl.value) {
		frameEl.value.src = frameUrl;
		iframeLoaded.value = false;
	}
	frameEl.value?.contentWindow?.postMessage({
		type: 'hanamisskey:meta',
		payload: {
			colorMode: store.s.darkMode ? 'dark' : 'light',
			instance: JSON.parse(JSON.stringify(instance)),
		},
	}, origin);

	if (rootEl.value) {
		const stickyTop = window.getComputedStyle(rootEl.value).getPropertyValue('--MI-stickyTop');
		frameEl.value?.contentWindow?.postMessage({
			type: 'hanamisskey:stickyTop',
			payload: stickyTop,
		}, origin);
	}

	const [planRes, statusRes] = await Promise.all([
		misskeyApi('premium/plans'),
		misskeyApi('premium/status'),
	]);

	buttonsState.value = Object.fromEntries(lpTier.map((tier) => {
		let state: ButtonState = 'notAvailable';
		if (statusRes.subscription?.plan.slug === tier && statusRes.subscription?.status === 'active') {
			state = 'manage';
		} else if (planRes.some((p) => p.slug === tier)) {
			state = 'canSubscribe';
		}
		return [tier, state];
	})) as Record<typeof lpTier[number], ButtonState>;

	currentPlan.value = statusRes.subscription;

	frameEl.value?.contentWindow?.postMessage({
		type: 'hanamisskey:premium:buttonState',
		payload: toRaw(buttonsState.value),
	}, origin);
}

watch(store.r.darkMode, (to) => {
	console.log('darkMode changed');
	frameEl.value?.contentWindow?.postMessage({
		type: 'hanamisskey:colorMode',
		payload: to ? 'dark' : 'light',
	}, origin);
});

const router = useRouter();

async function eventHandler(event: MessageEvent) {
	if (event.origin !== origin) return;

	if (event.data?.type === 'hanamisskey:lp:clicked') {
		switch (event.data.payload.button) {
			case 'aboutLink':
				router.push('/about');
				break;
		}
	}

	if (event.data?.type === 'hanamisskey:changeHeight') {
		iframeHeight.value = event.data.payload.height;
	}

	if (event.data?.type === 'hanamisskey:premium:clicked') {
		const planSlug = event.data.payload.button;
		const returnUrl = `${window.location.origin}/premium`;

		if (buttonsState.value?.[planSlug] === 'canSubscribe') {
			const hidePreview = waiting();

			const previewRes = await misskeyApi('premium/subscribe/preview', {
				planSlug,
			}).catch(() => null);

			hidePreview();

			if (!previewRes) {
				osAlert({
					type: 'error',
					title: i18n.ts._hana._subscription.failedToInitiatePayment,
					text: i18n.ts._hana._subscription.failedDescription,
				});
				return;
			}

			const { canceled } = await planConfirm({
				currentPlan: currentPlan.value,
				planChange: {
					type: 'change',
					preview: previewRes.preview,
				},
			});
			if (canceled) return;

			const hideExecute = waiting();
			const executeRes = await misskeyApi('premium/subscribe/execute', {
				planSlug,
				sessionId: previewRes.sessionId,
				returnUrl,
			}).catch(() => null);

			if (!executeRes) {
				hideExecute();
				osAlert({
					type: 'error',
					title: i18n.ts._hana._subscription.failedToInitiatePayment,
					text: i18n.ts._hana._subscription.failedDescription,
				});
				return;
			}

			if (executeRes.url) {
				location.href = executeRes.url;
			} else {
				hideExecute({ success: true });
			}
		} else if (buttonsState.value?.[planSlug] === 'manage') {
			router.push('/settings/subscription');
		}
	}
}

onMounted(() => {
	window.addEventListener('message', eventHandler);
});

onDeactivated(() => {
	iframeLoaded.value = false;
});

onUnmounted(() => {
	window.removeEventListener('message', eventHandler);
});

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: 'Premium',
	icon: 'ti ti-hanamisskey-hanamode',
	needWideArea: true,
}));
</script>

<style module>
.root {
	position: relative;
	margin-top: calc(var(--MI-stickyTop) * -1);
}

.frameWrapper {
	width: 100%;
	height: 100%;
	overflow: hidden;
	overflow-y: auto;
}

.frame {
	width: 100%;
	min-height: 100cqh;
	border: none;
	touch-action: none;
	overflow: hidden;
	overflow: clip;
}

.transition_x_enterActive,
.transition_x_leaveActive {
	transition: opacity 0.3s ease;
}

.transition_x_enterFrom,
.transition_x_leaveTo {
	opacity: 0;
}

.loader {
	position: fixed;
	top: 0;
	left: 0;
	width: 100cqw;
	height: 100cqh;
	background: var(--MI_THEME-bg);
	display: flex;
	align-items: center;
}

.loaderInner {
	margin: 0 auto;
	padding: 24px;
	text-align: center;
}
</style>
