import type { HanamiDisplayEvent } from '@/utility/hanami-impressions.js';
import * as interactions from '@/utility/hanami-interactions.js';

/** A positive viewport starts the browser's observation window before subsequent menu actions. */
export function startHanamiWindow(source: HanamiDisplayEvent): void {
	interactions.observeHanamiViewport({ ...source, kind: 'viewport', sequence: 0, elapsedMs: 0, occurredAtMs: Date.now(), utcOffsetMinutes: 0, visibleArea: 1, availableArea: 1, documentVisible: true, focused: true, activityAgeMs: 0, scrollIdleMs: 0, ended: false }, 1);
}
