import { url } from '@@/js/config.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import type { HanamiDisplayEvent, HanamiInteraction, HanamiObservation, HanamiViewportObservation } from '@/utility/hanami-impressions.js';
import { createHanamiObservationDelivery } from '@/utility/hanami-observations.js';
import { createHanamiObservationWindows } from '@/utility/hanami-observation-windows.js';
import type { HanamiOperationHandle } from '@/utility/hanami-observation-windows.js';
import { hanamiContextForNote } from '@/utility/hanami-recommendation-context.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { $i } from '@/i.js';

type Observer = { onAccepted: () => void; onExpired: (snapshotIds: string[]) => void };
const observers = new Set<Observer>();
let delivery: ReturnType<typeof createHanamiObservationDelivery> | undefined;
let listening = false;
let windows: ReturnType<typeof createHanamiObservationWindows> | undefined;
let windowAccount: string | undefined;

function getWindows() {
	if (!windows || windowAccount !== $i?.id) {
		windows?.dispose();
		windowAccount = $i?.id;
		windows = createHanamiObservationWindows({ enqueue: enqueueHanamiObservation, accountId: () => $i?.id, contextForNote: hanamiContextForNote });
	}
	return windows;
}

function getDelivery() {
	if (!delivery) {
		delivery = createHanamiObservationDelivery({
			onAccepted: () => { for (const observer of observers) observer.onAccepted(); },
			onExpired: ids => { for (const observer of observers) observer.onExpired(ids); },
			onDropped: (records, reason) => { windows?.dropped(records, reason); },
			onIdle: () => { delivery = undefined; },
			send: observations => misskeyApi('hanami-impressions', { version: 4, observations }, undefined, AbortSignal.timeout(30_000)),
		});
	}
	if (!listening) {
		listening = true;
		window.addEventListener('pagehide', () => { void delivery?.flush(); });
		window.document.addEventListener('visibilitychange', () => {
			if (window.document.hidden) void delivery?.flush();
		});
	}
	return delivery;
}

export function subscribeHanamiObservations(observer: Observer): () => void {
	observers.add(observer);
	return () => { observers.delete(observer); };
}

export function enqueueHanamiObservation(record: HanamiObservation): boolean { return getDelivery().enqueue(record); }
export function flushHanamiObservations(): Promise<void> { return delivery?.flush() ?? Promise.resolve(); }

export function recordHanamiInteraction(context: HanamiDisplayEvent | undefined, interaction: HanamiInteraction): void {
	if (!context) return;
	const source = hanamiContextForNote(context.eventId, context.noteId);
	if (!source) return;
	getWindows().record(source, interaction);
}

export function observeHanamiViewport(record: HanamiViewportObservation, displayPosition: number): boolean {
	return getWindows().viewport(record, displayPosition);
}

export function beginHanamiOperation(context: HanamiDisplayEvent | undefined): HanamiOperationHandle {
	const source = context && hanamiContextForNote(context.eventId, context.noteId);
	if (source) return getWindows().beginOperation(source);
	return { succeeded() {}, succeededFeedback() {}, cancelled() {}, uncertain() {} };
}

export function interruptHanamiObservation(context?: HanamiDisplayEvent): void {
	windows?.interrupt(context);
}

export async function copyHanamiLink(context: HanamiDisplayEvent | undefined, link: string): Promise<void> {
	const operation = beginHanamiOperation(context);
	try {
		if (await copyToClipboard(link)) operation.succeeded({ kind: 'link_copy' });
		else operation.cancelled();
	} catch (error) {
		operation.uncertain();
		throw error;
	}
}

export async function copyHanamiNavigationLink(path: string): Promise<void> {
	const target = new URL(path, url);
	const local = target.origin === new URL(url).origin;
	const noteId = local ? /^\/notes\/([^/]+)(?:\/|$)/.exec(target.pathname)?.[1] : undefined;
	const context = noteId ? hanamiContextForNote(target.searchParams.get('hanami') ?? undefined, noteId) : undefined;
	if (local) target.searchParams.delete('hanami');
	await copyHanamiLink(context, target.href);
}
