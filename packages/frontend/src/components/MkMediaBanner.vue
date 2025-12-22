<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<MkMediaAudio v-if="media.type.startsWith('audio') && media.type !== 'audio/midi'" :audio="media"/>
	<div v-else-if="media.isSensitive && hide" :class="[$style.sensitive, { [$style.sensitiveDisabled]: hanaStore.r.safeBrowsingConsent.value === false }]" @click="reveal">
		<span style="font-size: 1.6em;"><i class="ti ti-alert-triangle"></i></span>
		<b>{{ i18n.ts.sensitive }}</b>
		<span>{{ hanaStore.r.safeBrowsingConsent.value === false ? i18n.ts._hana._safeBrowsing.youCannotViewThisContent : i18n.ts.clickToShow }}</span>
	</div>
	<a
		v-else :class="$style.download"
		:href="media.url"
		:title="media.name"
		:download="media.name"
	>
		<span style="font-size: 1.6em;"><i class="ti ti-download"></i></span>
		<b>{{ media.name }}</b>
	</a>
</div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import MkMediaAudio from '@/components/MkMediaAudio.vue';
import { prefer } from '@/preferences.js';
import { hanaStore } from '@/hana/store.js';

const props = defineProps<{
	media: Misskey.entities.DriveFile;
}>();

const hide = ref(true);

async function reveal() {
	if (props.media.isSensitive) {
		if (hanaStore.s.safeBrowsingConsent === null) {
			const { canceled } = await os.confirm({
				type: 'question',
				title: i18n.ts._hana._safeBrowsing.areYouAged18OrOlder,
				text: i18n.ts._hana._safeBrowsing.youCanSetPreferencesLater,
				okText: i18n.ts.yes,
				cancelText: i18n.ts.no,
			});
			if (canceled) {
				await hanaStore.set('safeBrowsingConsent', false);
				return;
			} else {
				await hanaStore.set('safeBrowsingConsent', true);
			}
		} else if (hanaStore.s.safeBrowsingConsent === false) {
			// 18歳未満と回答済み
			return;
		}
	}
	if (props.media.isSensitive && prefer.s.confirmWhenRevealingSensitiveMedia) {
		const { canceled } = await os.confirm({
			type: 'question',
			text: i18n.ts.sensitiveMediaRevealConfirm,
		});
		if (canceled) return;
	}

	hide.value = false;
}
</script>

<style lang="scss" module>
.root {
	width: 100%;
	border-radius: 4px;
	margin-top: 4px;
	overflow: clip;
}

.download,
.sensitive {
	display: flex;
	align-items: center;
	font-size: 12px;
	padding: 8px 12px;
	white-space: nowrap;
}

.download {
}

.sensitive {
	background: #111;
	color: #fff;
}

.audio {
	border-radius: 8px;
	overflow: clip;
}
</style>
