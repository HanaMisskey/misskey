import { defineAsyncComponent } from 'vue';
import { popup } from '@/os.js';
import type { HanaSubscriptionConfirmDialogProps, HanaSubscriptionConfirmDialogDoneEvent } from '@/components/HanaSubscriptionConfirmDialog.vue';

export function planConfirm(pp: HanaSubscriptionConfirmDialogProps): Promise<HanaSubscriptionConfirmDialogDoneEvent> {
	return new Promise((resolve) => {
		const { dispose } = popup(defineAsyncComponent(() => import('@/components/HanaSubscriptionConfirmDialog.vue')), pp, {
			done: (res: HanaSubscriptionConfirmDialogDoneEvent) => {
				resolve(res);
			},
			closed: () => {
				dispose();
			},
		});
	});
}
