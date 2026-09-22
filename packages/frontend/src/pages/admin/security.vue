<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<SearchMarker path="/admin/security" :label="i18n.ts.security" :keywords="['security']" icon="ti ti-lock" :inlining="['botProtection']">
			<div class="_gaps_m">
				<XBotProtection/>

				<SearchMarker v-slot="slotProps" :keywords="['sensitive', 'media', 'detection']">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #icon><SearchIcon><i class="ti ti-eye-off"></i></SearchIcon></template>
						<template #label><SearchLabel>{{ i18n.ts.sensitiveMediaDetection }}</SearchLabel></template>
						<template v-if="sensitiveMediaDetectionForm.savedState.sensitiveMediaDetection === 'all'" #suffix>{{ i18n.ts.all }}</template>
						<template v-else-if="sensitiveMediaDetectionForm.savedState.sensitiveMediaDetection === 'local'" #suffix>{{ i18n.ts.localOnly }}</template>
						<template v-else-if="sensitiveMediaDetectionForm.savedState.sensitiveMediaDetection === 'remote'" #suffix>{{ i18n.ts.remoteOnly }}</template>
						<template v-else #suffix>{{ i18n.ts.none }}</template>
						<template v-if="sensitiveMediaDetectionForm.modified.value" #footer>
							<MkFormFooter :form="sensitiveMediaDetectionForm" :canSaving="canSaveSensitiveMediaDetection"/>
						</template>

						<div class="_gaps_m">
							<div><SearchText>{{ i18n.ts._sensitiveMediaDetection.description }}</SearchText></div>

							<MkInfo warn><SearchText>{{ i18n.ts._sensitiveMediaDetection.externalServiceInfo }}</SearchText></MkInfo>

							<MkRadios
								v-model="sensitiveMediaDetectionForm.state.sensitiveMediaDetection"
								:options="[
									{ value: 'none', label: i18n.ts.none },
									{ value: 'all', label: i18n.ts.all },
									{ value: 'local', label: i18n.ts.localOnly },
									{ value: 'remote', label: i18n.ts.remoteOnly },
								]"
							>
							</MkRadios>

							<SearchMarker :keywords="['api', 'url', 'endpoint', 'sensitive']">
								<MkInput v-model="sensitiveMediaDetectionForm.state.sensitiveMediaDetectionApiUrl" type="url">
									<template #label><SearchLabel>{{ i18n.ts._sensitiveMediaDetection.apiUrl }}</SearchLabel></template>
									<template #caption>
										<SearchText>{{ i18n.ts._sensitiveMediaDetection.apiUrlDescription }}</SearchText>
										<div>{{ i18n.tsx._sensitiveMediaDetection.serverSettingDescription({ value: meta.sensitiveMediaDetectionDefaults.apiUrl ?? i18n.ts.notSet }) }}</div>
									</template>
								</MkInput>
							</SearchMarker>

							<SearchMarker :keywords="['api', 'key', 'token', 'sensitive']">
								<MkSelect
									v-model="sensitiveMediaDetectionForm.state.sensitiveMediaDetectionApiKeyMode"
									:items="[
										{ value: 'inherit', label: i18n.ts._sensitiveMediaDetection.useServerSetting },
										{ value: 'custom', label: i18n.ts._sensitiveMediaDetection.specifyApiKey },
										{ value: 'none', label: i18n.ts._sensitiveMediaDetection.noAuthentication },
									]"
								>
									<template #label><SearchLabel>{{ i18n.ts._sensitiveMediaDetection.apiKey }}</SearchLabel></template>
									<template #caption><SearchText>{{ i18n.ts._sensitiveMediaDetection.apiKeyDescription }}</SearchText></template>
								</MkSelect>
								<MkInput v-if="sensitiveMediaDetectionForm.state.sensitiveMediaDetectionApiKeyMode === 'custom'" v-model="sensitiveMediaDetectionForm.state.sensitiveMediaDetectionApiKey" type="password" autocomplete="new-password" required>
									<template #prefix><i class="ti ti-key"></i></template>
									<template #label><SearchLabel>{{ i18n.ts._sensitiveMediaDetection.specifyApiKey }}</SearchLabel></template>
								</MkInput>
							</SearchMarker>

							<SearchMarker :keywords="['proxy', 'sensitive']">
								<MkSelect
									v-model="sensitiveMediaDetectionForm.state.sensitiveMediaDetectionUseProxy"
									:items="[
										{ value: 'default', label: i18n.ts._sensitiveMediaDetection.useServerSetting },
										{ value: 'on', label: i18n.ts.enabled },
										{ value: 'off', label: i18n.ts.disabled },
									]"
								>
									<template #label><SearchLabel>{{ i18n.ts._sensitiveMediaDetection.useProxy }}</SearchLabel></template>
									<template #caption>
										<SearchText>{{ i18n.ts._sensitiveMediaDetection.useProxyDescription }}</SearchText>
										<div>{{ i18n.tsx._sensitiveMediaDetection.serverSettingDescription({ value: meta.sensitiveMediaDetectionDefaults.useProxy ? i18n.ts.enabled : i18n.ts.disabled }) }}</div>
									</template>
								</MkSelect>
							</SearchMarker>

							<!-- MkInput に null を戻すと 0 が再通知されるため、継承中の空欄は NaN で渡す。 -->
							<SearchMarker :keywords="['timeout', 'sensitive']">
								<MkInput
									:modelValue="sensitiveMediaDetectionForm.state.sensitiveMediaDetectionTimeout ?? Number.NaN" type="number" :min="1" :max="2147483647" :step="1"
									@update:modelValue="sensitiveMediaDetectionForm.state.sensitiveMediaDetectionTimeout = Number.isNaN($event) ? null : $event"
								>
									<template #label><SearchLabel>{{ i18n.ts._sensitiveMediaDetection.timeout }}</SearchLabel></template>
									<template #caption>
										<SearchText>{{ i18n.ts._sensitiveMediaDetection.timeoutDescription }}</SearchText>
										<div>{{ i18n.tsx._sensitiveMediaDetection.serverSettingDescription({ value: `${meta.sensitiveMediaDetectionDefaults.timeout}ms` }) }}</div>
									</template>
								</MkInput>
							</SearchMarker>

							<SearchMarker :keywords="['max', 'images', 'chunk', 'sensitive']">
								<MkInput
									:modelValue="sensitiveMediaDetectionForm.state.sensitiveMediaDetectionMaxImagesPerRequest ?? Number.NaN" type="number" :min="1" :max="2147483647" :step="1"
									@update:modelValue="sensitiveMediaDetectionForm.state.sensitiveMediaDetectionMaxImagesPerRequest = Number.isNaN($event) ? null : $event"
								>
									<template #label><SearchLabel>{{ i18n.ts._sensitiveMediaDetection.maxImagesPerRequest }}</SearchLabel></template>
									<template #caption>
										<SearchText>{{ i18n.ts._sensitiveMediaDetection.maxImagesPerRequestDescription }}</SearchText>
										<div>{{ i18n.tsx._sensitiveMediaDetection.serverSettingDescription({ value: meta.sensitiveMediaDetectionDefaults.maxImagesPerRequest }) }}</div>
									</template>
								</MkInput>
							</SearchMarker>

							<SearchMarker :keywords="['sensitivity']">
								<MkRange v-model="sensitiveMediaDetectionForm.state.sensitiveMediaDetectionSensitivity" :min="0" :max="4" :step="1" :textConverter="(v) => `${v + 1}`">
									<template #label><SearchLabel>{{ i18n.ts._sensitiveMediaDetection.sensitivity }}</SearchLabel></template>
									<template #caption><SearchText>{{ i18n.ts._sensitiveMediaDetection.sensitivityDescription }}</SearchText></template>
								</MkRange>
							</SearchMarker>

							<SearchMarker :keywords="['video', 'analyze']">
								<MkSwitch v-model="sensitiveMediaDetectionForm.state.enableSensitiveMediaDetectionForVideos">
									<template #label><SearchLabel>{{ i18n.ts._sensitiveMediaDetection.analyzeVideos }}</SearchLabel><span class="_beta">{{ i18n.ts.beta }}</span></template>
									<template #caption><SearchText>{{ i18n.ts._sensitiveMediaDetection.analyzeVideosDescription }}</SearchText></template>
								</MkSwitch>
							</SearchMarker>

							<SearchMarker :keywords="['flag', 'automatically']">
								<MkSwitch v-model="sensitiveMediaDetectionForm.state.setSensitiveFlagAutomatically">
									<template #label><SearchLabel>{{ i18n.ts._sensitiveMediaDetection.setSensitiveFlagAutomatically }}</SearchLabel> ({{ i18n.ts.notRecommended }})</template>
									<template #caption><SearchText>{{ i18n.ts._sensitiveMediaDetection.setSensitiveFlagAutomaticallyDescription }}</SearchText></template>
								</MkSwitch>
							</SearchMarker>

							<!-- 現状 false positive が多すぎて実用に耐えない
					<MkSwitch v-model="disallowUploadWhenPredictedAsPorn">
						<template #label>{{ i18n.ts._sensitiveMediaDetection.disallowUploadWhenPredictedAsPorn }}</template>
					</MkSwitch>
					-->
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker v-slot="slotProps" :keywords="['email', 'validation']">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #label><SearchLabel>Active Email Validation</SearchLabel></template>
						<template v-if="emailValidationForm.savedState.enableActiveEmailValidation" #suffix>Enabled</template>
						<template v-else #suffix>Disabled</template>
						<template v-if="emailValidationForm.modified.value" #footer>
							<MkFormFooter :form="emailValidationForm"/>
						</template>

						<div class="_gaps_m">
							<div><SearchText>{{ i18n.ts.activeEmailValidationDescription }}</SearchText></div>

							<SearchMarker>
								<MkSwitch v-model="emailValidationForm.state.enableActiveEmailValidation">
									<template #label><SearchLabel>Enable</SearchLabel></template>
								</MkSwitch>
							</SearchMarker>

							<SearchMarker>
								<MkSwitch v-model="emailValidationForm.state.enableVerifymailApi">
									<template #label><SearchLabel>Use Verifymail.io API</SearchLabel></template>
								</MkSwitch>
							</SearchMarker>

							<SearchMarker>
								<MkInput v-model="emailValidationForm.state.verifymailAuthKey">
									<template #prefix><i class="ti ti-key"></i></template>
									<template #label><SearchLabel>Verifymail.io API Auth Key</SearchLabel></template>
								</MkInput>
							</SearchMarker>

							<SearchMarker>
								<MkSwitch v-model="emailValidationForm.state.enableTruemailApi">
									<template #label><SearchLabel>Use TrueMail API</SearchLabel></template>
								</MkSwitch>
							</SearchMarker>

							<SearchMarker>
								<MkInput v-model="emailValidationForm.state.truemailInstance">
									<template #prefix><i class="ti ti-key"></i></template>
									<template #label><SearchLabel>TrueMail API Instance</SearchLabel></template>
								</MkInput>
							</SearchMarker>

							<SearchMarker>
								<MkInput v-model="emailValidationForm.state.truemailAuthKey">
									<template #prefix><i class="ti ti-key"></i></template>
									<template #label><SearchLabel>TrueMail API Auth Key</SearchLabel></template>
								</MkInput>
							</SearchMarker>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker v-slot="slotProps" :keywords="['banned', 'email', 'domains', 'blacklist']">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #label><SearchLabel>Banned Email Domains</SearchLabel></template>
						<template v-if="bannedEmailDomainsForm.modified.value" #footer>
							<MkFormFooter :form="bannedEmailDomainsForm"/>
						</template>

						<div class="_gaps_m">
							<SearchMarker>
								<MkTextarea v-model="bannedEmailDomainsForm.state.bannedEmailDomains">
									<template #label><SearchLabel>Banned Email Domains List</SearchLabel></template>
								</MkTextarea>
							</SearchMarker>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker v-slot="slotProps" :keywords="['log', 'ipAddress']">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #label><SearchLabel>Log IP address</SearchLabel></template>
						<template v-if="ipLoggingForm.savedState.enableIpLogging" #suffix>Enabled</template>
						<template v-else #suffix>Disabled</template>
						<template v-if="ipLoggingForm.modified.value" #footer>
							<MkFormFooter :form="ipLoggingForm"/>
						</template>

						<div class="_gaps_m">
							<SearchMarker>
								<MkSwitch v-model="ipLoggingForm.state.enableIpLogging">
									<template #label><SearchLabel>Enable</SearchLabel></template>
								</MkSwitch>
							</SearchMarker>
						</div>
					</MkFolder>
				</SearchMarker>
			</div>
		</SearchMarker>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import XBotProtection from './bot-protection.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkRadios from '@/components/MkRadios.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkRange from '@/components/MkRange.vue';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkInfo from '@/components/MkInfo.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useForm } from '@/composables/use-form.js';
import MkFormFooter from '@/components/MkFormFooter.vue';

const meta = await misskeyApi('admin/meta');

const sensitiveMediaDetectionForm = useForm({
	sensitiveMediaDetection: meta.sensitiveMediaDetection,
	sensitiveMediaDetectionSensitivity: meta.sensitiveMediaDetectionSensitivity === 'veryLow' ? 0 :
	meta.sensitiveMediaDetectionSensitivity === 'low' ? 1 :
	meta.sensitiveMediaDetectionSensitivity === 'medium' ? 2 :
	meta.sensitiveMediaDetectionSensitivity === 'high' ? 3 :
	meta.sensitiveMediaDetectionSensitivity === 'veryHigh' ? 4 : 0,
	setSensitiveFlagAutomatically: meta.setSensitiveFlagAutomatically,
	enableSensitiveMediaDetectionForVideos: meta.enableSensitiveMediaDetectionForVideos,
	sensitiveMediaDetectionApiUrl: meta.sensitiveMediaDetectionApiUrl,
	sensitiveMediaDetectionApiKey: meta.sensitiveMediaDetectionApiKey ?? '',
	sensitiveMediaDetectionApiKeyMode: meta.sensitiveMediaDetectionApiKey == null ? 'inherit' as const : meta.sensitiveMediaDetectionApiKey === '' ? 'none' as const : 'custom' as const,
	sensitiveMediaDetectionUseProxy: meta.sensitiveMediaDetectionUseProxy == null ? 'default' as const : meta.sensitiveMediaDetectionUseProxy ? 'on' as const : 'off' as const,
	sensitiveMediaDetectionTimeout: meta.sensitiveMediaDetectionTimeout,
	sensitiveMediaDetectionMaxImagesPerRequest: meta.sensitiveMediaDetectionMaxImagesPerRequest,
}, async (state) => {
	await os.apiWithDialog('admin/update-meta', {
		sensitiveMediaDetection: state.sensitiveMediaDetection,
		sensitiveMediaDetectionSensitivity:
			state.sensitiveMediaDetectionSensitivity === 0 ? 'veryLow' :
			state.sensitiveMediaDetectionSensitivity === 1 ? 'low' :
			state.sensitiveMediaDetectionSensitivity === 2 ? 'medium' :
			state.sensitiveMediaDetectionSensitivity === 3 ? 'high' :
			state.sensitiveMediaDetectionSensitivity === 4 ? 'veryHigh' :
			null as never,
		setSensitiveFlagAutomatically: state.setSensitiveFlagAutomatically,
		enableSensitiveMediaDetectionForVideos: state.enableSensitiveMediaDetectionForVideos,
		sensitiveMediaDetectionApiUrl: state.sensitiveMediaDetectionApiUrl,
		sensitiveMediaDetectionApiKey: state.sensitiveMediaDetectionApiKeyMode === 'inherit' ? null : state.sensitiveMediaDetectionApiKeyMode === 'none' ? '' : state.sensitiveMediaDetectionApiKey,
		sensitiveMediaDetectionUseProxy: state.sensitiveMediaDetectionUseProxy === 'default' ? null : state.sensitiveMediaDetectionUseProxy === 'on',
		sensitiveMediaDetectionTimeout: state.sensitiveMediaDetectionTimeout,
		sensitiveMediaDetectionMaxImagesPerRequest: state.sensitiveMediaDetectionMaxImagesPerRequest,
	});
	fetchInstance(true);
});

const canSaveSensitiveMediaDetection = computed(() => {
	const state = sensitiveMediaDetectionForm.state;
	return (state.sensitiveMediaDetectionApiKeyMode !== 'custom' || state.sensitiveMediaDetectionApiKey !== '') &&
		[state.sensitiveMediaDetectionTimeout, state.sensitiveMediaDetectionMaxImagesPerRequest]
			.every(value => value == null || (Number.isInteger(value) && value >= 1 && value <= 2147483647));
});

const ipLoggingForm = useForm({
	enableIpLogging: meta.enableIpLogging,
}, async (state) => {
	await os.apiWithDialog('admin/update-meta', {
		enableIpLogging: state.enableIpLogging,
	});
	fetchInstance(true);
});

const emailValidationForm = useForm({
	enableActiveEmailValidation: meta.enableActiveEmailValidation,
	enableVerifymailApi: meta.enableVerifymailApi,
	verifymailAuthKey: meta.verifymailAuthKey,
	enableTruemailApi: meta.enableTruemailApi,
	truemailInstance: meta.truemailInstance,
	truemailAuthKey: meta.truemailAuthKey,
}, async (state) => {
	await os.apiWithDialog('admin/update-meta', {
		enableActiveEmailValidation: state.enableActiveEmailValidation,
		enableVerifymailApi: state.enableVerifymailApi,
		verifymailAuthKey: state.verifymailAuthKey,
		enableTruemailApi: state.enableTruemailApi,
		truemailInstance: state.truemailInstance,
		truemailAuthKey: state.truemailAuthKey,
	});
	fetchInstance(true);
});

const bannedEmailDomainsForm = useForm({
	bannedEmailDomains: meta.bannedEmailDomains?.join('\n') || '',
}, async (state) => {
	await os.apiWithDialog('admin/update-meta', {
		bannedEmailDomains: state.bannedEmailDomains.split('\n'),
	});
	fetchInstance(true);
});

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.security,
	icon: 'ti ti-lock',
}));
</script>
