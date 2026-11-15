import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { HanamiRecommendationsService } from '@/core/hanamifeed/HanamiRecommendationsService.js';
import { hanamiApiError, hanamiApiErrors } from '@/core/hanamifeed/HanamiApiError.js';

export const meta = {
	tags: ['notes'], requireCredential: true, kind: 'write:account', requiredRolePolicy: 'hanamiTlAvailable', errors: hanamiApiErrors,
	res: { type: 'object', optional: false, nullable: false, properties: {
		revision: { type: 'integer', optional: false, nullable: false }, refreshRequired: { type: 'boolean', optional: false, nullable: false },
	} },
} as const;
export const paramDef = {
	type: 'object', additionalProperties: false, properties: {
		i: { type: 'string' }, eventId: { type: 'string', minLength: 1, maxLength: 128 }, snapshotId: { type: 'string', minLength: 1, maxLength: 128 }, entryId: { type: 'string', minLength: 1, maxLength: 128 },
		target: { type: 'object', additionalProperties: false, properties: { kind: { type: 'string', enum: ['author', 'tag', 'note'] }, id: { type: 'string', minLength: 1, maxLength: 256 } }, required: ['kind', 'id'] },
		action: { type: 'string', enum: ['more', 'less', 'reset'] },
	}, required: ['eventId', 'snapshotId', 'entryId', 'target', 'action'],
} as const;
@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private service: HanamiRecommendationsService) {
		super(meta, paramDef, async (ps, me) => {
			try { return await this.service.submitFeedback(me, { eventId: ps.eventId, snapshotId: ps.snapshotId, entryId: ps.entryId, target: ps.target, action: ps.action }); } catch (error) { throw hanamiApiError(error); }
		});
	}
}
