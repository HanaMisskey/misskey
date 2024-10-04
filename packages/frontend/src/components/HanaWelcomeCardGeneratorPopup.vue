<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_panel _shadow" :class="$style.root">
	<div :class="$style.icon">
		<img src="https://static-assets.misskey.flowers/misc/welcome-card/hana_welcome_res.png"/>
	</div>
	<div :class="$style.main" class="_gaps_s">
		<div :class="$style.title">{{ i18n.ts._hana._welcomeCardGenPopup.title }}</div>
		<div :class="$style.text">{{ i18n.ts._hana._welcomeCardGenPopup.description }}</div>
		<div class="_buttons">
			<MkButton primary @click="openDialog"><i class="ti ti-pencil"></i> {{ i18n.ts._hana._welcomeCardGenPopup.create }}</MkButton>
		</div>
		<div class="_buttons">
			<MkButton @click="close">{{ i18n.ts.later }}</MkButton>
			<MkButton @click="neverShow">{{ i18n.ts.neverShow }}</MkButton>
		</div>
	</div>
	<button class="_button" :class="$style.close" @click="close"><i class="ti ti-x"></i></button>
</div>
</template>

<script lang="ts" setup>
import { defineAsyncComponent } from 'vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { hanaStore } from '@/hana/store.js';
import * as os from '@/os.js';

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const zIndex = os.claimZIndex('low');

function openDialog() {
	const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/HanaWelcomeCardGeneratorDialog.vue')), {}, {
		completed: () => {
			close();
		},
		closed: () => {
			dispose();
		},
	});
}

function close() {
	hanaStore.set('lastShowWelcomeCardPopup', Date.now());
	emit('closed');
}

function neverShow() {
	hanaStore.set('neverShowWelcomeCardPopup', true);
	close();
}
</script>

<style lang="scss" module>
.root {
	position: fixed;
	z-index: v-bind(zIndex);
	bottom: var(--margin);
	left: 0;
	right: 0;
	margin: auto;
	box-sizing: border-box;
	width: calc(100% - (var(--margin) * 2));
	max-width: 500px;
	display: flex;
}

.icon {
	padding-top: 25px;
	width: 125px;
	position: relative;
	overflow: hidden;
	overflow: clip;
	pointer-events: none;
	user-select: none;
	-webkit-user-drag: none;

	> img {
		position: absolute;
		bottom: 10%;
		right: 20%;
		height: 50%;
		border: 2px solid var(--accent);
		border-radius: var(--radius);
		transform: rotate(-10deg);
	}
}

@media (max-width: 500px) {
	.icon {
		width: 100px;
	}
}
@media (max-width: 450px) {
	.icon {
		width: 80px;
	}
}

.main {
	padding: 25px 25px 25px 0;
	flex: 1;
}

.close {
	position: absolute;
	top: 8px;
	right: 8px;
	padding: 8px;
}

.title {
	font-weight: bold;
}
</style>
