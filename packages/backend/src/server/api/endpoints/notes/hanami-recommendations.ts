import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { HanamiRecommendationsService } from '@/core/hanamifeed/HanamiRecommendationsService.js';
import { hanamiApiError, hanamiApiErrors } from '@/core/hanamifeed/HanamiApiError.js';
import { hanamiClientCapabilitiesSchema } from '@/core/hanamifeed/HanamiClientCapabilities.js';
import { hanamiDeviceContextSchema } from '@/core/hanamifeed/HanamiDeviceContext.js';

export const meta = {
	tags: ['notes'], requireCredential: true, kind: 'read:account', requiredRolePolicy: 'hanamiTlAvailable', errors: hanamiApiErrors,
	res: { type: 'object', optional: false, nullable: false, properties: {
		items: { type: 'array', optional: false, nullable: false, items: { type: 'object', optional: false, nullable: false, properties: {
			entryId: { type: 'string', optional: false, nullable: false }, note: { type: 'object', ref: 'Note', optional: false, nullable: false },
		} } },
		nextCursor: { type: 'string', optional: false, nullable: true }, snapshotId: { type: 'string', optional: false, nullable: false },
		revision: { type: 'integer', optional: false, nullable: false },
	} },
} as const;
export const paramDef = {
	type: 'object', additionalProperties: false,
	properties: {
		i: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
		cursor: { type: 'string', minLength: 1, maxLength: 4096 }, refresh: { type: 'boolean', default: false },
		imageFilter: { type: 'string', enum: ['any', 'with_image', 'without_image'], default: 'any' },
		withFiles: { type: 'boolean', default: false },
		utcOffsetMinutes: { type: 'integer', minimum: -840, maximum: 840 },
		deviceContext: hanamiDeviceContextSchema,
		clientCapabilities: hanamiClientCapabilitiesSchema,
	}, required: [],
} as const;
@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private service: HanamiRecommendationsService) {
		super(meta, paramDef, async (ps, me) => {
			if (ps.cursor && ps.refresh) throw new ApiError({ code: 'INVALID_PARAM', message: 'Invalid param.', id: 'd59d16e1-d513-48c4-827f-48243c393578' });
			try {
				return await this.service.getRecommendations(me, {
					limit: ps.limit, cursor: ps.cursor, refresh: ps.refresh, imageFilter: ps.imageFilter, withFiles: ps.withFiles,
					...(ps.utcOffsetMinutes === undefined ? {} : { utcOffsetMinutes: ps.utcOffsetMinutes }),
					...(ps.deviceContext === undefined ? {} : { deviceContext: ps.deviceContext }),
					...(ps.clientCapabilities === undefined ? {} : { clientCapabilities: ps.clientCapabilities }),
				});
			} catch (error) { throw hanamiApiError(error); }
		});
	}
}
