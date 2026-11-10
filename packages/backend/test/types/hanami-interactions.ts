import type { MiUser } from '@/models/_.js';
import type { HanamiPlatformClient } from '@/core/hanamifeed/HanamiPlatformClient.js';
import type { HanamiInteractionObservation, HanamiPlatformContract } from '@/core/hanamifeed/HanamiPlatformWire.js';
import { detailObservation, imageObservation, replyObservation, viewportObservation } from '../utils/HanamiInteractionsFixture.js';
import type { Endpoints } from '../../../misskey-js/src/autogen/endpoint.js';
import type { EmptyResponse } from '../../../misskey-js/src/autogen/entities.js';
import type { operations } from '../../../misskey-js/src/autogen/types.js';

type Same<Actual, Expected> = 0 extends (1 & Actual) ? false : [Actual] extends [Expected] ? [Expected] extends [Actual] ? true : false : false;
type Assert<T extends true> = T;
type PublicRequest = Endpoints['hanami-impressions']['req'];
/** Oracle: the 2026-11-10 public contract permits only bodyless 204 success, excluding the former 200 count receipt. The SDK keeps its existing EmptyResponse abstraction; Promise<void> is required at the frontend delivery boundary. */
type PublicResponses = operations['hanami-impressions']['responses'];
export type NoContentSuccessStatus = Assert<Same<Extract<`${keyof PublicResponses}`, `2${string}`>, '204'>>;
export type NoContentBody = Assert<Same<Extract<keyof PublicResponses[204], 'content'>, never>>;
export type NoContentResponse = Assert<Same<Endpoints['hanami-impressions']['res'], EmptyResponse>>;
type PublicV4 = Extract<PublicRequest, { version: 4 }>;
type Observation = PublicV4['observations'][number];
type CommonKeys = 'eventId' | 'snapshotId' | 'entryId' | 'noteId' | 'kind' | 'occurredAtMs' | 'utcOffsetMinutes' | 'deviceContext' | 'windowId' | 'windowSequence' | 'windowElapsedMs';

/** Oracle: 端末文脈契約（2026-11-09）§1。context全体はoptionalだが、存在すれば三つのenumを全て必須とし、公開SDK・内部型・署名wireで一致させる。legacyには追加しない。 */
export type ExpectedDeviceContext = {
	deviceClass: 'mobile' | 'tablet' | 'desktop' | 'unknown';
	viewportClass: 'compact' | 'medium' | 'wide' | 'unknown';
	primaryPointer: 'coarse' | 'fine' | 'none' | 'unknown';
};
type PublicDeviceContext = NonNullable<Observation['deviceContext']>;
type SignedV4 = Extract<HanamiPlatformContract['/internal/v1/observations']['request'], { version: 4 }>;
export type OptionalPublicDeviceContext = Assert<Same<Observation['deviceContext'], ExpectedDeviceContext | undefined>>;
export type PublicDeviceContextKeys = Assert<Same<keyof PublicDeviceContext, keyof ExpectedDeviceContext>>;
export type PublicDeviceClasses = Assert<Same<PublicDeviceContext['deviceClass'], ExpectedDeviceContext['deviceClass']>>;
export type PublicViewportClasses = Assert<Same<PublicDeviceContext['viewportClass'], ExpectedDeviceContext['viewportClass']>>;
export type PublicPrimaryPointers = Assert<Same<PublicDeviceContext['primaryPointer'], ExpectedDeviceContext['primaryPointer']>>;
export type InternalDeviceContext = Assert<Same<HanamiInteractionObservation['deviceContext'], ExpectedDeviceContext | undefined>>;
export type SignedDeviceContext = Assert<Same<SignedV4['observations'][number]['deviceContext'], ExpectedDeviceContext | undefined>>;
export type NoLegacyDeviceContext = Assert<Same<Extract<keyof Extract<PublicRequest, { events: unknown[] }>['events'][number], 'deviceContext'>, never>>;

/** Oracle: 推薦操作観測契約（2026-11-08）§1。生成 SDK 自体が kind ごとの payload を区別する。union を any や自由 object に変えても通る fixture にしない。 */
export type CommonObservationKeys = Assert<Same<keyof Observation, CommonKeys>>;
export type ObservationKinds = Assert<Same<Observation['kind'], 'viewport' | 'detail_open' | 'image_open' | 'link_copy' | 'share' | 'action' | 'window' | 'feedback'>>;
export type ImageFile = Assert<Same<Extract<Observation, { kind: 'image_open' }>['fileId'], string>>;
export type DetailKeys = Assert<Same<keyof Extract<Observation, { kind: 'detail_open' | 'link_copy' | 'share' }>, CommonKeys>>;
export type ViewportKeys = Assert<Same<keyof Extract<Observation, { kind: 'viewport' }>, CommonKeys | 'sequence' | 'elapsedMs' | 'visibleArea' | 'availableArea' | 'documentVisible' | 'ended' | 'focused' | 'activityAgeMs' | 'scrollIdleMs'>>;
export type ActionNames = Assert<Same<Extract<Observation, { kind: 'action' }>['action'], 'reply' | 'quote' | 'follow' | 'mute' | 'block' | 'report'>>;
export type OptionalRecommendationOffset = Assert<Same<Endpoints['notes/hanami-recommendations']['req']['utcOffsetMinutes'], number | undefined>>;

/** Oracle: window-api §5 keeps the receipt union closed and capability optional; the SDK generator must retain the exact new public shape. */
export type FeedbackKeys = Assert<Same<keyof Extract<Observation, { kind: 'feedback' }>, CommonKeys>>;
export type WindowPhases = Assert<Same<Extract<Observation, { kind: 'window' }>['phase'], 'open' | 'checkpoint' | 'close'>>;
export type OpenWindowKeys = Assert<Same<keyof Extract<Observation, { kind: 'window'; phase: 'open' }>, CommonKeys | 'phase' | 'displayPosition'>>;
export type CheckpointKeys = Assert<Same<keyof Extract<Observation, { kind: 'window'; phase: 'checkpoint' }>, CommonKeys | 'phase'>>;
export type CloseWindowKeys = Assert<Same<keyof Extract<Observation, { kind: 'window'; phase: 'close' }>, CommonKeys | 'phase' | 'recordCount' | 'complete' | 'pendingActions' | 'endReason'>>;
export type OptionalClientCapabilities = Assert<Same<Endpoints['notes/hanami-recommendations']['req']['clientCapabilities'], { nativeShare: boolean } | undefined>>;
export const validWindow: PublicRequest = { version: 4, observations: [{ ...detailObservation(), kind: 'window', eventId: 'window-a', windowId: 'window-a', windowSequence: 0, windowElapsedMs: 0, phase: 'open', displayPosition: 1 }] };
export const validFeedback: PublicRequest = { version: 4, observations: [{ ...detailObservation(), kind: 'feedback', eventId: 'saved-feedback' }] };

export const validV4: PublicRequest = { version: 4, observations: [viewportObservation(), detailObservation(), imageObservation(), replyObservation()] };
export const validV4DeviceContext: PublicRequest = { version: 4, observations: [{ ...detailObservation(), deviceContext: { deviceClass: 'unknown', viewportClass: 'unknown', primaryPointer: 'unknown' } }] };
export const validLegacy: PublicRequest = { events: [{ eventId: 'legacy', snapshotId: 'snapshot', entryId: 'entry' }] };
export const refreshRequiredV3: PublicRequest = { version: 3, observations: [detailObservation()] };
export const refreshRequiredV2: PublicRequest = { version: 2, observations: [{ eventId: 'legacy-viewport', snapshotId: 'snapshot', entryId: 'entry', sequence: 0, elapsedMs: 0, visibleArea: 50, availableArea: 100, documentVisible: true, ended: false }] };

/** Oracle: 公開型には内部 attestation、ブラウザ選択主体、任意の kind-specific payload を含めない。 */
export function rejectedPublicInteractionTypes(observation: Observation) {
	// @ts-expect-error A present context must include all three coarse fields.
	const missingContextField: Observation = { ...detailObservation(), deviceContext: { deviceClass: 'mobile', viewportClass: 'compact' } };
	// @ts-expect-error The device classification is a closed enum.
	const invalidDevice: Observation = { ...detailObservation(), deviceContext: { deviceClass: 'phone', viewportClass: 'compact', primaryPointer: 'coarse' } };
	// @ts-expect-error Optional context permits omission, not null.
	const nullContext: Observation = { ...detailObservation(), deviceContext: null };
	// @ts-expect-error Raw UA details are outside the public observation contract.
	const privateContext: Observation = { ...detailObservation(), deviceContext: { deviceClass: 'mobile', viewportClass: 'compact', primaryPointer: 'coarse', userAgent: 'private' } };
	// @ts-expect-error An image requires a file ID.
	const image: Observation = { ...detailObservation(), kind: 'image_open' };
	// @ts-expect-error A reply requires the persisted evidence note ID.
	const reply: Observation = { ...detailObservation(), kind: 'action', action: 'reply' };
	// @ts-expect-error Follow does not carry an evidence note.
	const follow: Observation = { ...detailObservation(), kind: 'action', action: 'follow', evidenceNoteId: 'unrelated' };
	// @ts-expect-error DB verification belongs only to the signed server envelope.
	const attested: Observation = { ...replyObservation(), verified: true, sourceRowId: 'row' };
	// @ts-expect-error The browser cannot set the viewer.
	const forgedViewer: PublicV4 = { version: 4, observations: [detailObservation()], viewerId: 'other' };
	// @ts-expect-error Detail events do not report geometry.
	const geometry: Observation = { ...detailObservation(), sequence: 0 };
	// @ts-expect-error more/less/reset stay on their confirmed feedback API.
	const preference: Observation = { ...detailObservation(), kind: 'action', action: 'less' };
	// @ts-expect-error DM collection is out of scope.
	const dm: Observation = { ...detailObservation(), kind: 'dm' };
	if (observation.kind === 'image_open') {
		const file: string = observation.fileId;
		void file;
	}
	void [image, reply, follow, attested, forgedViewer, geometry, preference, dm, missingContextField, invalidDevice, nullContext, privateContext];
}

/** Oracle: signed observations の新規配送は v4 を使い、ACK は受付件数だけを返す。内部署名直前の DB attestation は client が作る。 */
export async function signedInteractionTypes(client: HanamiPlatformClient, viewer: MiUser) {
	const ack = await client.request(viewer, '/internal/v1/observations', { version: 4, observations: [detailObservation(), replyObservation()] });
	const exact: Same<typeof ack, { accepted: number; duplicates: number }> = true;
	void client.request(viewer, '/internal/v1/recommendations', { limit: 20, imageFilter: 'any', utcOffsetMinutes: 540 });
	void client.request(viewer, '/internal/v1/observations', { version: 4, observations: [{ ...replyObservation(), deviceContext: { deviceClass: 'tablet', viewportClass: 'medium', primaryPointer: 'none' } }] });
	// @ts-expect-error A caller cannot claim successful DB verification.
	void client.request(viewer, '/internal/v1/observations', { version: 4, observations: [{ ...replyObservation(), verified: true, sourceRowId: 'claimed-row' }] });
	// @ts-expect-error A v4 event must name its kind.
	void client.request(viewer, '/internal/v1/observations', { version: 4, observations: [{ eventId: 'e', snapshotId: 's', entryId: 'i', noteId: 'n', occurredAtMs: 1, utcOffsetMinutes: 0 }] });
	// @ts-expect-error Receipts contain only the declared count fields.
	void ack.extraFlag;
	void exact;
}
