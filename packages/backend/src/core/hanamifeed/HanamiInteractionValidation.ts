import { validHanamiDeviceContext } from './HanamiDeviceContext.js';
import type { HanamiObservationsRequest } from './HanamiPlatformWire.js';

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && [...value].length <= 128;
const nonnegativeInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const area = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const identityKeys = ['eventId', 'snapshotId', 'entryId', 'noteId', 'kind', 'occurredAtMs', 'utcOffsetMinutes', 'deviceContext', 'windowId', 'windowSequence', 'windowElapsedMs'];
const onlyKeys = (value: Record<string, unknown>, keys: string[]): boolean => Object.keys(value).every(key => keys.includes(key));

export function validHanamiInteractionRequest(value: unknown, now: number): value is Extract<HanamiObservationsRequest, { version: 4 }> {
	if (!object(value) || !onlyKeys(value, ['version', 'observations']) || value.version !== 4 || !Array.isArray(value.observations) || value.observations.length < 1 || value.observations.length > 100) return false;
	return value.observations.every(record => {
		if (!object(record) || !['eventId', 'snapshotId', 'entryId', 'noteId'].every(key => identifier(record[key])) || !nonnegativeInteger(record.occurredAtMs) || record.occurredAtMs < now - 1_800_000 || record.occurredAtMs > now + 30_000 || typeof record.utcOffsetMinutes !== 'number' || !Number.isSafeInteger(record.utcOffsetMinutes) || Math.abs(record.utcOffsetMinutes) > 840) return false;
		if ('deviceContext' in record && !validHanamiDeviceContext(record.deviceContext)) return false;
		const hasWindow = ['windowId', 'windowSequence', 'windowElapsedMs'].some(key => key in record);
		if (hasWindow && (!identifier(record.windowId) || !nonnegativeInteger(record.windowSequence) || record.windowSequence > 399 || !nonnegativeInteger(record.windowElapsedMs) || record.windowElapsedMs > 60_000)) return false;
		switch (record.kind) {
			case 'window':
				if (!hasWindow || record.eventId !== record.windowId) return false;
				if (record.phase === 'open') return onlyKeys(record, [...identityKeys, 'phase', 'displayPosition']) && record.windowSequence === 0 && record.windowElapsedMs === 0 && nonnegativeInteger(record.displayPosition) && record.displayPosition >= 1 && record.displayPosition <= 10_000;
				if (record.phase === 'checkpoint') return onlyKeys(record, [...identityKeys, 'phase']);
				return record.phase === 'close' && onlyKeys(record, [...identityKeys, 'phase', 'recordCount', 'complete', 'pendingActions', 'endReason'])
					&& nonnegativeInteger(record.recordCount) && record.recordCount >= 2 && record.recordCount <= 400 && record.windowSequence === record.recordCount - 1
					&& typeof record.complete === 'boolean' && nonnegativeInteger(record.pendingActions) && record.pendingActions <= 400
					&& typeof record.endReason === 'string' && ['completed', 'interrupted', 'pending_action', 'delivery_failed', 'budget_exhausted', 'timer_gap'].includes(record.endReason)
					&& (!record.complete || (record.windowElapsedMs === 60_000 && record.pendingActions === 0 && record.endReason === 'completed'));
			case 'feedback':
				return onlyKeys(record, identityKeys);
			case 'viewport':
				return onlyKeys(record, [...identityKeys, 'sequence', 'elapsedMs', 'visibleArea', 'availableArea', 'documentVisible', 'ended', 'focused', 'activityAgeMs', 'scrollIdleMs'])
					&& ['sequence', 'elapsedMs', 'activityAgeMs', 'scrollIdleMs'].every(key => nonnegativeInteger(record[key]))
					&& area(record.visibleArea) && area(record.availableArea)
					&& ['documentVisible', 'ended', 'focused'].every(key => typeof record[key] === 'boolean');
			case 'detail_open':
			case 'link_copy':
			case 'share':
				return onlyKeys(record, identityKeys);
			case 'image_open':
				return onlyKeys(record, [...identityKeys, 'fileId']) && identifier(record.fileId);
			case 'action':
				if (record.action === 'reply' || record.action === 'quote') return onlyKeys(record, [...identityKeys, 'action', 'evidenceNoteId']) && identifier(record.evidenceNoteId);
				return onlyKeys(record, [...identityKeys, 'action']) && typeof record.action === 'string' && ['follow', 'mute', 'block', 'report'].includes(record.action);
			default:
				return false;
		}
	});
}
