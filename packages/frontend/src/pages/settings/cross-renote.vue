<template>
<div class="_gaps">
	<MkInfo warn>{{ i18n.ts._hana._crossRenote.warning }}</MkInfo>
	<div class="_gaps_s">
		<MkFolder v-for="account in hanaStore.reactiveState.crossRenoteAccounts.value" :key="account.id">
			<template #label>{{ account.serverName ?? account.host }}</template>
			<template #caption>@{{ account.username }}@{{ account.host }}</template>
			<XSettings
				:account="account"
				@changed="onSettingsChanged"
				@delete="removeAccount"
			/>
		</MkFolder>
	</div>
	<div class="_buttons">
		<MkButton
			primary
			:disabled="$i.policies.crossRenoteAccountLimit <= hanaStore.reactiveState.crossRenoteAccounts.value.length"
			@click="addAccount"
		><i class="ti ti-plus"></i>{{ i18n.ts.addAccount }}</MkButton>
	</div>
</div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue';
import { v4 as uuid } from 'uuid';
import * as Misskey from 'misskey-js';

import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkWaitingDialog from '@/components/MkWaitingDialog.vue';

import XSettings from './cross-renote.settings.vue';

import { signinRequired } from '@/account.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { hostname, url } from '@@/js/config.js';
import { extractDomain } from '@@/js/url.js';

import { hanaStore } from '@/hana/store.js';
import { misskeyApi } from '@/scripts/misskey-api.js';
import { reloadAsk } from '@/scripts/reload-ask.js';
import { useRouter } from '@/router/supplier.js';

import type { CrossRenoteStore } from '@/hana/scripts/cross-renote.js';

const props = defineProps<{
	host?: string;
	sessionId?: string;
}>();

const $i = signinRequired();

function onSettingsChanged(newValue: CrossRenoteStore) {
	os.promiseDialog(hanaStore.set('crossRenoteAccounts', hanaStore.state.crossRenoteAccounts.map((account) => {
		if (account.id === newValue.id) {
			return newValue;
		} else {
			return account;
		}
	}))).then(() => {
		reloadAsk({
			unison: true,
			reason: i18n.ts.reloadToApplySetting,
		});
	});
}

async function addAccount() {
	if ($i.policies.crossRenoteAccountLimit <= hanaStore.reactiveState.crossRenoteAccounts.value.length) {
		os.alert({
			text: i18n.ts._hana._crossRenote.accountQtyExceeded,
			type: 'error',
		});
		return;
	}

	const { canceled, result: hostTemp } = await os.inputText({
		title: i18n.ts.inputHostName,
		placeholder: 'misskey.example.com',
	});

	if (canceled) return;

	const showing = ref(true);

	const { dispose } = os.popup(MkWaitingDialog, {
		success: false,
		showing,
	}, {
		closed: () => dispose(),
	});

	await nextTick();

	let targetHost: string | null = extractDomain(hostTemp ?? '');
	if (targetHost === null || targetHost === hostname) {
		showing.value = false;
		os.alert({
			title: i18n.ts.invalidValue,
			text: i18n.ts.tryAgain,
			type: 'error'
		});
		return;
	}

	const authUrl = new URL(`https://${targetHost}/miauth/${uuid()}`);
	authUrl.searchParams.set('callback', `${url}/settings/cross-renote?host=${targetHost}`);
	authUrl.searchParams.set('icon', 'https://static-assets.misskey.flowers/brand-assets/icons/app_v1_512x512.png');
	authUrl.searchParams.set('name', `${i18n.ts._hana.hanaMisskey} (${i18n.ts._hana._crossRenote.title})`);
	authUrl.searchParams.set('permission', 'read:account,write:notes');

	location.href = authUrl.toString();
}

async function removeAccount(accountId: string) {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts.deleteConfirm,
	});

	if (canceled) return;

	os.promiseDialog(hanaStore.set('crossRenoteAccounts', hanaStore.reactiveState.crossRenoteAccounts.value.filter((account) => account.id !== accountId)));
}

if (props.sessionId && props.host) {
	const verifyPromise = (async () => {
		const res = await fetch(`https://${props.host}/api/miauth/${props.sessionId}/check`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: '{}',
		});

		if (res.status !== 200) {
			os.alert({
				title: i18n.ts.somethingHappened,
				text: i18n.ts.failedToFetchAccountInformation,
				type: 'error'
			});
			return;
		}

		const resJson = await res.json() as {
			ok: boolean;
			token: string;
			user: Misskey.entities.User;
		};

		if (resJson.ok !== true) {
			os.alert({
				title: i18n.ts.somethingHappened,
				text: i18n.ts.failedToFetchAccountInformation,
				type: 'error'
			});
			return;
		}

		let instanceInfoRes: Misskey.entities.FederationShowInstanceResponse | null = null;

		try {
			instanceInfoRes = await misskeyApi('federation/show-instance', {
				host: props.host!,
			});
		} catch (e) {
			// ignore
		}

		if (hanaStore.reactiveState.crossRenoteAccounts.value.some((account) => account.userId === resJson.user.id)) {
			const { canceled } = await os.confirm({
				type: 'info',
				text: i18n.ts._hana._crossRenote.alreadyLinked,
			});

			if (canceled) {
				return;
			}
		}

		hanaStore.set('crossRenoteAccounts', [
			...hanaStore.reactiveState.crossRenoteAccounts.value.filter((account) => account.userId !== resJson.user.id),
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

	os.promiseDialog(verifyPromise).then(() => {
		const router = useRouter();
		router.replace('/settings/cross-renote');
	});
}
</script>
