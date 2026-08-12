import * as fs from 'node:fs';
import ms from 'ms';
import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { MultipartUploadService } from '@/core/MultipartUploadService.js';
import { ApiError } from '../../../../error.js';

export const meta = {
	tags: ['drive'],

	requireCredential: true,

	prohibitMoved: true,

	limit: {
		duration: ms('1hour'),
		max: 600,
	},

	requireFile: true,

	kind: 'write:drive',

	description: 'Upload a part of a multipart upload session.',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			partNumber: {
				type: 'number',
				optional: false, nullable: false,
			},
			done: {
				type: 'boolean',
				optional: false, nullable: false,
			},
		},
	},

	errors: {
		sessionNotFound: {
			message: 'The specified session was not found.',
			code: 'SESSION_NOT_FOUND',
			id: '60823be8-5d2e-4b59-a735-ebae8d221659',
		},
		sessionOwnerMismatch: {
			message: 'You are not the owner of this session.',
			code: 'SESSION_OWNER_MISMATCH',
			id: 'b94fcee6-25a9-46dd-b04c-3c252110e950',
		},
		invalidPartNumber: {
			message: 'Invalid part number.',
			code: 'INVALID_PART_NUMBER',
			id: '8593eb1f-1d32-45a4-8398-c85585378aa7',
		},
		maxFileSizeExceeded: {
			message: 'Cannot upload the file because it exceeds the maximum file size.',
			code: 'MAX_FILE_SIZE_EXCEEDED',
			id: '7255361a-43f0-42ca-9e77-ef1c1025d173',
			httpStatusCode: 413,
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sessionId: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' },
		partNumber: { type: 'integer', minimum: 1, maximum: 10000 },
	},
	required: ['sessionId', 'partNumber'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private multipartUploadService: MultipartUploadService,
	) {
		super(meta, paramDef, async (ps, me, _, file, cleanup) => {
			try {
				const fileSize = fs.statSync(file!.path).size;

				const result = await this.multipartUploadService.uploadPart(
					ps.sessionId,
					me.id,
					ps.partNumber,
					file!.path,
					fileSize,
				);

				return result;
			} catch (err) {
				if (err instanceof Error) {
					switch (err.message) {
						case 'SESSION_NOT_FOUND':
							throw new ApiError(meta.errors.sessionNotFound);
						case 'SESSION_OWNER_MISMATCH':
							throw new ApiError(meta.errors.sessionOwnerMismatch);
						case 'INVALID_PART_NUMBER':
							throw new ApiError(meta.errors.invalidPartNumber);
						case 'MAX_FILE_SIZE_EXCEEDED':
							throw new ApiError(meta.errors.maxFileSizeExceeded);
					}
				}
				throw new ApiError();
			} finally {
				cleanup!();
			}
		});
	}
}
