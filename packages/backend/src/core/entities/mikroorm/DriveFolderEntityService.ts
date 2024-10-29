import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { DriveFilesRepository, DriveFoldersRepository } from '@/models/mikroorm/_.js';
import { awaitAll } from '@/misc/prelude/await-all.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiDriveFolder } from '@/models/mikroorm/DriveFolder.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';

@Injectable()
export class DriveFolderEntityService {
	constructor(
		@Inject(DI.driveFoldersRepository)
		private driveFoldersRepository: DriveFoldersRepository,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		private idService: IdService,
	) {}

	@bindThis
	public async pack(
		src: MiDriveFolder['id'] | MiDriveFolder,
		options?: {
			detail: boolean;
		},
	): Promise<Packed<'DriveFolder'>> {
		const opts = { detail: false, ...options };

		const folder = typeof src === 'object'
			? src
			: await this.driveFoldersRepository.findOneOrFail({ id: src });

		return await awaitAll({
			id: folder.id,
			createdAt: this.idService.parse(folder.id).date.toISOString(),
			name: folder.name,
			parentId: folder.parentId,

			...(opts.detail ? {
				foldersCount: await this.driveFoldersRepository.count({ where: { parentId: folder.id } }),
				filesCount: await this.driveFilesRepository.count({ where: { folderId: folder.id } }),

				...(folder.parentId ? {
					parent: await this.pack(folder.parentId, { detail: true }),
				} : {}),
			} : {}),
		});
	}
}
