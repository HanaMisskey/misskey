import ms from 'ms';
import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { MultipartUploadService } from '@/core/MultipartUploadService.js';
import { ApiError } from '../../../../error.js';

export const meta = {
	tags: ['drive'],

	requireCredential: true,

	limit: {
		duration: ms('1hour'),
		max: 100,
	},

	kind: 'write:drive',

	description: 'Abort a multipart upload session.',

	errors: {
		sessionNotFound: {
			message: 'The specified session was not found.',
			code: 'SESSION_NOT_FOUND',
			id: '87b4774e-b838-4272-8d4d-79dddf74827e',
		},
		sessionOwnerMismatch: {
			message: 'You are not the owner of this session.',
			code: 'SESSION_OWNER_MISMATCH',
			id: '54130e06-4f77-453e-9d12-85be5d96a4b7',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sessionId: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' },
	},
	required: ['sessionId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private multipartUploadService: MultipartUploadService,
	) {
		super(meta, paramDef, async (ps, me) => {
			try {
				await this.multipartUploadService.abortUpload(ps.sessionId, me.id);
			} catch (err) {
				if (err instanceof Error) {
					switch (err.message) {
						case 'SESSION_NOT_FOUND':
							throw new ApiError(meta.errors.sessionNotFound);
						case 'SESSION_OWNER_MISMATCH':
							throw new ApiError(meta.errors.sessionOwnerMismatch);
					}
				}
				throw new ApiError();
			}
		});
	}
}
