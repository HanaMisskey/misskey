import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { MultipartUploadService } from '@/core/MultipartUploadService.js';
import { RoleService } from '@/core/RoleService.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { DB_MAX_IMAGE_COMMENT_LENGTH } from '@/const.js';
import { ApiError } from '../../../../error.js';

export const meta = {
	tags: ['drive'],

	requireCredential: true,

	prohibitMoved: true,

	limit: {
		duration: ms('1hour'),
		max: 10,
	},

	kind: 'write:drive',

	description: 'Initiate a multipart upload session.',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			sessionId: {
				type: 'string',
				optional: false, nullable: false,
			},
		},
	},

	errors: {
		invalidFileName: {
			message: 'Invalid file name.',
			code: 'INVALID_FILE_NAME',
			id: '0928dc02-c169-4f8d-94a4-04ef740667df',
		},
		maxFileSizeExceeded: {
			message: 'Cannot upload the file because it exceeds the maximum file size.',
			code: 'MAX_FILE_SIZE_EXCEEDED',
			id: '6e7bdb48-efaf-4dc9-a6dd-e0e5cd1e63cf',
			httpStatusCode: 413,
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		name: { type: 'string', nullable: true, default: null },
		totalParts: { type: 'integer', minimum: 1, maximum: 10000 },
		totalSize: { type: 'integer', minimum: 1, nullable: true, default: null },
		comment: { type: 'string', nullable: true, maxLength: DB_MAX_IMAGE_COMMENT_LENGTH, default: null },
		folderId: { type: 'string', format: 'misskey:id', nullable: true, default: null },
		isSensitive: { type: 'boolean', default: false },
		force: { type: 'boolean', default: false },
	},
	required: ['totalParts'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private multipartUploadService: MultipartUploadService,
		private roleService: RoleService,
		private driveFileEntityService: DriveFileEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// Normalize file name (consistent with drive/files/create)
			let name = ps.name ?? null;
			if (name != null) {
				name = name.trim();
				if (name.length === 0) {
					name = null;
				} else if (name === 'blob') {
					name = null;
				} else if (!this.driveFileEntityService.validateFileName(name)) {
					throw new ApiError(meta.errors.invalidFileName);
				}
			}

			// Get user's max file size from role policies
			const policies = await this.roleService.getUserPolicies(me.id);
			const maxFileSize = 1024 * 1024 * policies.maxFileSizeMb;

			// Pre-validate total size if provided
			if (ps.totalSize != null && ps.totalSize > maxFileSize) {
				throw new ApiError(meta.errors.maxFileSizeExceeded);
			}

			const result = await this.multipartUploadService.createSession(me.id, {
				fileName: name,
				totalParts: ps.totalParts,
				totalSize: ps.totalSize,
				comment: ps.comment,
				folderId: ps.folderId,
				isSensitive: ps.isSensitive,
				force: ps.force,
				maxFileSize,
			});

			return result;
		});
	}
}
