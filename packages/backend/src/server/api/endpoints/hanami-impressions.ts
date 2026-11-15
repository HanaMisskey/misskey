import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { HanamiPlatformError } from '@/core/hanamifeed/HanamiPlatformClient.js';
import { HanamiRecommendationsService } from '@/core/hanamifeed/HanamiRecommendationsService.js';
import type { HanamiImpressionsRequest } from '@/core/hanamifeed/HanamiPlatformWire.js';
import { hanamiApiError, hanamiApiErrors } from '@/core/hanamifeed/HanamiApiError.js';
import { hanamiDeviceContextSchema } from '@/core/hanamifeed/HanamiDeviceContext.js';

export const meta = {
	tags: ['notes'], requireCredential: true, kind: 'write:account', requiredRolePolicy: 'hanamiTlAvailable', errors: hanamiApiErrors,
} as const;
const identity = {
	eventId: { type: 'string', minLength: 1, maxLength: 128 }, snapshotId: { type: 'string', minLength: 1, maxLength: 128 }, entryId: { type: 'string', minLength: 1, maxLength: 128 },
} as const;
const nonnegativeInteger = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER } as const;
const windowMetadata = {
	windowId: { type: 'string', minLength: 1, maxLength: 128 },
	windowSequence: { type: 'integer', minimum: 0, maximum: 399 },
	windowElapsedMs: { type: 'integer', minimum: 0, maximum: 60_000 },
} as const;
const windowRequired = ['windowId', 'windowSequence', 'windowElapsedMs'] as const;
const windowDependencies = { windowId: windowRequired, windowSequence: windowRequired, windowElapsedMs: windowRequired } as const;
const interactionIdentity = {
	...identity, noteId: { type: 'string', minLength: 1, maxLength: 128 },
	occurredAtMs: nonnegativeInteger, utcOffsetMinutes: { type: 'integer', minimum: -840, maximum: 840 },
	deviceContext: hanamiDeviceContextSchema, ...windowMetadata,
} as const;
const interactionRequired = ['eventId', 'snapshotId', 'entryId', 'noteId', 'kind', 'occurredAtMs', 'utcOffsetMinutes'] as const;
const interactionParamDef = {
	type: 'object', additionalProperties: false, properties: {
		i: { type: 'string' }, version: { type: 'integer', const: 4 },
		observations: { type: 'array', minItems: 1, maxItems: 100, items: { oneOf: [{
			type: 'object', additionalProperties: false, dependencies: windowDependencies, properties: {
				...interactionIdentity, kind: { type: 'string', enum: ['viewport'] },
				sequence: nonnegativeInteger, elapsedMs: nonnegativeInteger,
				visibleArea: { type: 'number', minimum: 0 }, availableArea: { type: 'number', minimum: 0 },
				documentVisible: { type: 'boolean' }, ended: { type: 'boolean' }, focused: { type: 'boolean' },
				activityAgeMs: nonnegativeInteger, scrollIdleMs: nonnegativeInteger,
			}, required: [...interactionRequired, 'sequence', 'elapsedMs', 'visibleArea', 'availableArea', 'documentVisible', 'ended', 'focused', 'activityAgeMs', 'scrollIdleMs'],
		}, {
			type: 'object', additionalProperties: false, dependencies: windowDependencies, properties: {
				...interactionIdentity, kind: { type: 'string', enum: ['detail_open', 'link_copy', 'share'] },
			}, required: interactionRequired,
		}, {
			type: 'object', additionalProperties: false, dependencies: windowDependencies, properties: {
				...interactionIdentity, kind: { type: 'string', enum: ['image_open'] }, fileId: { type: 'string', minLength: 1, maxLength: 128 },
			}, required: [...interactionRequired, 'fileId'],
		}, {
			type: 'object', additionalProperties: false, dependencies: windowDependencies, properties: {
				...interactionIdentity, kind: { type: 'string', enum: ['action'] }, action: { type: 'string', enum: ['reply', 'quote'] },
				evidenceNoteId: { type: 'string', minLength: 1, maxLength: 128 },
			}, required: [...interactionRequired, 'action', 'evidenceNoteId'],
		}, {
			type: 'object', additionalProperties: false, dependencies: windowDependencies, properties: {
				...interactionIdentity, kind: { type: 'string', enum: ['action'] }, action: { type: 'string', enum: ['follow', 'mute', 'block', 'report'] },
			}, required: [...interactionRequired, 'action'],
		}, {
			type: 'object', additionalProperties: false, dependencies: windowDependencies, properties: {
				...interactionIdentity, kind: { type: 'string', enum: ['feedback'] },
			}, required: interactionRequired,
		}, {
			type: 'object', additionalProperties: false, properties: {
				...interactionIdentity, kind: { type: 'string', enum: ['window'] }, phase: { type: 'string', enum: ['open'] },
				displayPosition: { type: 'integer', minimum: 1, maximum: 10_000 },
				windowSequence: { type: 'integer', const: 0 }, windowElapsedMs: { type: 'integer', const: 0 },
			}, required: [...interactionRequired, ...windowRequired, 'phase', 'displayPosition'],
		}, {
			type: 'object', additionalProperties: false, properties: {
				...interactionIdentity, kind: { type: 'string', enum: ['window'] }, phase: { type: 'string', enum: ['checkpoint'] },
			}, required: [...interactionRequired, ...windowRequired, 'phase'],
		}, {
			type: 'object', additionalProperties: false, properties: {
				...interactionIdentity, kind: { type: 'string', enum: ['window'] }, phase: { type: 'string', enum: ['close'] },
				recordCount: { type: 'integer', minimum: 2, maximum: 400 }, complete: { type: 'boolean' },
				pendingActions: { type: 'integer', minimum: 0, maximum: 400 },
				endReason: { type: 'string', enum: ['completed', 'interrupted', 'pending_action', 'delivery_failed', 'budget_exhausted', 'timer_gap'] },
			}, required: [...interactionRequired, ...windowRequired, 'phase', 'recordCount', 'complete', 'pendingActions', 'endReason'],
		}] } },
	}, required: ['version', 'observations'],
} as const;
export const paramDef = {
	oneOf: [interactionParamDef, {
		...interactionParamDef, properties: { ...interactionParamDef.properties, version: { type: 'integer', const: 3 } },
	}, {
		type: 'object', additionalProperties: false, properties: {
			i: { type: 'string' }, version: { type: 'integer', const: 2 },
			observations: { type: 'array', minItems: 1, maxItems: 100, items: {
				type: 'object', additionalProperties: false, properties: {
					...identity,
					sequence: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER }, elapsedMs: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
					visibleArea: { type: 'number', minimum: 0 }, availableArea: { type: 'number', minimum: 0 }, documentVisible: { type: 'boolean' }, ended: { type: 'boolean' },
				}, required: ['eventId', 'snapshotId', 'entryId', 'sequence', 'elapsedMs', 'visibleArea', 'availableArea', 'documentVisible', 'ended'],
			} },
		}, required: ['version', 'observations'],
	}, {
		type: 'object', additionalProperties: false, properties: {
			i: { type: 'string' }, events: { type: 'array', minItems: 1, maxItems: 100, items: {
				type: 'object', additionalProperties: false, properties: identity, required: ['eventId', 'snapshotId', 'entryId'],
			} },
		}, required: ['events'],
	}],
} as const;
@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private service: HanamiRecommendationsService) {
		super(meta, paramDef, async (ps, me) => {
			try {
				if ('version' in ps && ps.version !== 4) throw new HanamiPlatformError('REFRESH_REQUIRED');
				const request = ('events' in ps ? { events: ps.events } : { version: ps.version, observations: ps.observations }) as HanamiImpressionsRequest;
				await this.service.submitImpressions(me, request);
			} catch (error) { throw hanamiApiError(error); }
		});
	}
}
