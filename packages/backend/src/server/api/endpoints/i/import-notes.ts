import { Inject, Injectable } from '@nestjs/common';
import ms from 'ms';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { QueueService } from '@/core/QueueService.js';
import type { DriveFilesRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '../../error.js';

export const meta = {
	secure: true,
	requireCredential: true,
	requireRolePolicy: 'canImportNotes',
	prohibitMoved: true,

	limit: {
		duration: ms('1hour'),
		max: 2,
	},

	errors: {
		noSuchFile: {
			message: 'No such file.',
			code: 'NO_SUCH_FILE',
			id: 'b98644cf-a5ac-4277-a502-0b8054a709a3',
		},

		emptyFile: {
			message: 'That file is empty.',
			code: 'EMPTY_FILE',
			id: '31a1b42c-06f7-42ae-8a38-a661c5c9f691',
		},

		thisServiceIsTemporarilyUnavailable: {
			message: 'Importing notes from this service is temporarily unavailable.',
			code: 'TEMPORARILY_UNAVAILABLE',
			id: '5e8fb268-42c1-4320-8ee3-b475823bec64',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		fileId: { type: 'string', format: 'misskey:id' },
		type: { type: 'string', nullable: true },
	},
	required: ['fileId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		private queueService: QueueService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// 一時的な対応
			if (ps.type == null || ps.type !== 'Misskey') throw new ApiError(meta.errors.thisServiceIsTemporarilyUnavailable);

			const file = await this.driveFilesRepository.findOneBy({ id: ps.fileId });

			if (file == null) throw new ApiError(meta.errors.noSuchFile);

			if (file.size === 0) throw new ApiError(meta.errors.emptyFile);

			// 一時的な対応
			if (!file.name.startsWith('notes-') || !file.name.endsWith('.json')) throw new ApiError(meta.errors.thisServiceIsTemporarilyUnavailable);

			this.queueService.createImportNotesJob(me, file.id, ps.type);
		});
	}
}
