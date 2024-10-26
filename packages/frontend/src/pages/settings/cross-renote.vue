<template>
<div class="_gaps">
	<MkInfo warn>{{ i18n.ts._hana._crossRenote.warning }}</MkInfo>
	<div class="_gaps_s">
		<MkFolder v-for="account in hanaStore.reactiveState.crossRenoteAccounts.value" :key="account.id">
			<template #label>{{ account.serverName ?? account.host }}</template>
			<template #caption>@{{ account.username }}@{{ account.host }}</template>
			<XSettings :account="account" @changed="onSettingsChanged"/>
		</MkFolder>
	</div>
	<div class="_buttons">
		<MkButton primary @click="addAccount"><i class="ti ti-plus"></i>{{ i18n.ts.addAccount }}</MkButton>
	</div>
</div>
</template>

<script setup lang="ts">
import { v4 as uuid } from 'uuid';
import * as Misskey from 'misskey-js';

import MkInfo from '@/components/MkInfo.vue';
import MkFolder from '@/components/MkFolder.vue';

import XSettings from './cross-renote.settings.vue';

import { signinRequired } from '@/account.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';

import { hanaStore } from '@/hana/store.js';
import { misskeyApi } from '@/scripts/misskey-api.js';
import type { CrossRenoteStore } from '@/hana/scripts/cross-renote.js';
import { reloadAsk } from '@/scripts/reload-ask';

const props = defineProps<{
	host?: string;
	sessionId?: string;
}>();

const $i = signinRequired();

function onSettingsChanged(newValue: CrossRenoteStore) {
	hanaStore.set('crossRenoteAccounts', hanaStore.state.crossRenoteAccounts.map((account) => {
		if (account.id === newValue.id) {
			return newValue;
		} else {
			return account;
		}
	})).then(() => {
		reloadAsk({
			unison: true,
			reason: i18n.ts.reloadToApplySetting,
		});
	});
}

function addAccount() {
}

if (props.sessionId && props.host) {
	const verifyPromise = (async () => {
		const res = await fetch(`https://${props.host}/api/miauth/${props.sessionId}/check`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			}
		});

		if (res.status !== 200) {
			return os.alert({
				title: i18n.ts.somethingHappened,
				text: i18n.ts.failedToFetchAccountInformation,
				type: 'error'
			});
		}

		const resJson = await res.json() as {
			token: string;
			user: Misskey.entities.User;
		};

		let instanceInfoRes: Misskey.entities.FederationShowInstanceResponse | null = null;

		try {
			instanceInfoRes = await misskeyApi('federation/show-instance', {
				host: props.host!,
			});
		} catch (e) {
			// ignore
		}

		if (hanaStore.state.crossRenoteAccounts.some((account) => account.userId === resJson.user.id)) {
			const { canceled } = await os.confirm({
				type: 'info',
				text: i18n.ts._hana._crossRenote.alreadyLinked,
			});

			if (canceled) {
				return;
			}
		}

		hanaStore.set('crossRenoteAccounts', [
			...hanaStore.state.crossRenoteAccounts.filter((account) => account.userId !== resJson.user.id),
			{
				id: uuid(),
				host: props.host!,
				token: resJson.token,
				userId: resJson.user.id,
				username: resJson.user.username,
				serverName: instanceInfoRes?.name ?? undefined,
			}
		]);
	})();

	os.promiseDialog(verifyPromise);
}
</script>
