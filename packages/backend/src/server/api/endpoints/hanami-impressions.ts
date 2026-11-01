import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { HanamiRecommendationsService } from '@/core/hanamifeed/HanamiRecommendationsService.js';
import { hanamiApiError, hanamiApiErrors } from '@/core/hanamifeed/HanamiApiError.js';

export const meta = {
	tags: ['notes'], requireCredential: true, kind: 'write:account', requiredRolePolicy: 'hanamiTlAvailable', errors: hanamiApiErrors,
	res: { type: 'object', optional: false, nullable: false, properties: {
		accepted: { type: 'integer', optional: false, nullable: false }, duplicates: { type: 'integer', optional: false, nullable: false },
		completedEventIds: { type: 'array', optional: true, nullable: false, items: { type: 'string' } },
	} },
} as const;
const identity = {
	eventId: { type: 'string', minLength: 1, maxLength: 128 }, snapshotId: { type: 'string', minLength: 1, maxLength: 128 }, entryId: { type: 'string', minLength: 1, maxLength: 128 },
} as const;
export const paramDef = {
	oneOf: [{
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
				return await this.service.submitImpressions(me, 'observations' in ps ? { version: 2, observations: ps.observations } : { events: ps.events });
			} catch (error) { throw hanamiApiError(error); }
		});
	}
}
