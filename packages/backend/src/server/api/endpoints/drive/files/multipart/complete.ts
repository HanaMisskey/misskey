import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { MultipartUploadService } from '@/core/MultipartUploadService.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { MiMeta } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '../../../../error.js';

export const meta = {
	tags: ['drive'],

	requireCredential: true,

	prohibitMoved: true,

	limit: {
		duration: ms('1hour'),
		max: 120,
	},

	kind: 'write:drive',

	description: 'Complete a multipart upload session and create the drive file.',

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'DriveFile',
	},

	errors: {
		sessionNotFound: {
			message: 'The specified session was not found.',
			code: 'SESSION_NOT_FOUND',
			id: '8ea4d889-0e1a-47eb-9d5a-0448f8f69193',
		},
		sessionOwnerMismatch: {
			message: 'You are not the owner of this session.',
			code: 'SESSION_OWNER_MISMATCH',
			id: '4db1ff36-ba26-40c3-b6fd-13d6d6772c18',
		},
		incompleteParts: {
			message: 'Not all parts have been uploaded.',
			code: 'INCOMPLETE_PARTS',
			id: '0cd4c705-ad68-43ee-83f5-4f91fabd9837',
		},
		inappropriate: {
			message: 'Cannot upload the file because it has been determined that it possibly contains inappropriate content.',
			code: 'INAPPROPRIATE',
			id: 'e139e558-0f55-4cdd-b6f5-254ed49504f6',
		},
		noFreeSpace: {
			message: 'Cannot upload the file because you have no free space of drive.',
			code: 'NO_FREE_SPACE',
			id: '99cab6c7-e9f6-47fa-8a20-1dbd3dd00a1d',
		},
		maxFileSizeExceeded: {
			message: 'Cannot upload the file because it exceeds the maximum file size.',
			code: 'MAX_FILE_SIZE_EXCEEDED',
			id: '5aa6e147-fbb1-4ed6-9796-c9ca75c01e45',
			httpStatusCode: 413,
		},
		unallowedFileType: {
			message: 'Cannot upload the file because it is an unallowed file type.',
			code: 'UNALLOWED_FILE_TYPE',
			id: '014ba954-0e2b-4f57-aca3-7a899e472b6a',
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
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		private multipartUploadService: MultipartUploadService,
		private driveFileEntityService: DriveFileEntityService,
	) {
		super(meta, paramDef, async (ps, me, _, _file, _cleanup, ip, headers) => {
			try {
				const driveFile = await this.multipartUploadService.completeUpload(
					ps.sessionId,
					me,
					this.serverSettings.enableIpLogging ? (ip ?? null) : null,
					this.serverSettings.enableIpLogging ? (headers ?? null) : null,
				);

				return await this.driveFileEntityService.pack(driveFile, { self: true });
			} catch (err) {
				if (err instanceof Error) {
					switch (err.message) {
						case 'SESSION_NOT_FOUND':
							throw new ApiError(meta.errors.sessionNotFound);
						case 'SESSION_OWNER_MISMATCH':
							throw new ApiError(meta.errors.sessionOwnerMismatch);
						case 'INCOMPLETE_PARTS':
							throw new ApiError(meta.errors.incompleteParts);
					}
				}
				if (err instanceof IdentifiableError) {
					if (err.id === '282f77bf-5816-4f72-9264-aa14d8261a21') throw new ApiError(meta.errors.inappropriate);
					if (err.id === 'c6244ed2-a39a-4e1c-bf93-f0fbd7764fa6') throw new ApiError(meta.errors.noFreeSpace);
					if (err.id === 'f9e4e5f3-4df4-40b5-b400-f236945f7073') throw new ApiError(meta.errors.maxFileSizeExceeded);
					if (err.id === 'bd71c601-f9b0-4808-9137-a330647ced9b') throw new ApiError(meta.errors.unallowedFileType);
				}
				throw new ApiError();
			}
		});
	}
}
