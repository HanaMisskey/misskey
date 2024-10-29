import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { DriveFilesRepository } from '@/models/mikroorm/_.js';
import type { Config } from '@/config.js';
import type { Packed } from '@/misc/json-schema.js';
import { awaitAll } from '@/misc/prelude/await-all.js';
import type { MiUser } from '@/models/mikroorm/User.js';
import type { MiDriveFile } from '@/models/mikroorm/DriveFile.js';
import { appendQuery, query } from '@/misc/prelude/url.js';
import { deepClone } from '@/misc/clone.js';
import { bindThis } from '@/decorators.js';
import { isMimeImage } from '@/misc/is-mime-image.js';
import { IdService } from '@/core/IdService.js';
import { UtilityService } from '../../UtilityService.js';
import { VideoProcessingService } from '../../VideoProcessingService.js';
import { UserEntityService } from './UserEntityService.js';
import { DriveFolderEntityService } from './DriveFolderEntityService.js';

type PackOptions = {
	detail?: boolean,
	self?: boolean,
	withUser?: boolean,
};

@Injectable()
export class DriveFileEntityService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		@Inject(forwardRef(() => UserEntityService))
		private userEntityService: UserEntityService,

		private utilityService: UtilityService,
		private driveFolderEntityService: DriveFolderEntityService,
		private videoProcessingService: VideoProcessingService,
		private idService: IdService,
	) {}

	@bindThis
	public validateFileName(name: string): boolean {
		return (
			(name.trim().length > 0) &&
			(name.length <= 200) &&
			(name.indexOf('\\') === -1) &&
			(name.indexOf('/') === -1) &&
			(name.indexOf('..') === -1)
		);
	}

	@bindThis
	public getPublicProperties(file: MiDriveFile): MiDriveFile['properties'] {
		if (file.properties.orientation != null) {
			const properties = deepClone(file.properties);
			if (file.properties.orientation >= 5) {
				[properties.width, properties.height] = [properties.height, properties.width];
			}
			properties.orientation = undefined;
			return properties;
		}
		return file.properties;
	}

	@bindThis
	private getProxiedUrl(url: string, mode?: 'static' | 'avatar'): string {
		return appendQuery(
			`${this.config.mediaProxy}/${mode ?? 'image'}.webp`,
			query({
				url,
				...(mode ? { [mode]: '1' } : {}),
			}),
		);
	}

	@bindThis
	public getThumbnailUrl(file: MiDriveFile): string | null {
		if (file.type.startsWith('video')) {
			if (file.thumbnailUrl) return file.thumbnailUrl;

			return this.videoProcessingService.getExternalVideoThumbnailUrl(file.webpublicUrl ?? file.url);
		} else if (file.uri != null && file.userHost != null && this.config.externalMediaProxyEnabled) {
			return this.getProxiedUrl(file.uri, 'static');
		}

		if (file.uri != null && file.isLink && this.config.proxyRemoteFiles) {
			return this.getProxiedUrl(file.uri, 'static');
		}

		const url = file.webpublicUrl ?? file.url;
		return file.thumbnailUrl ?? (isMimeImage(file.type, 'sharp-convertible-image') ? url : null);
	}

	@bindThis
	public getPublicUrl(file: MiDriveFile, mode?: 'avatar'): string { // static = thumbnail
		// リモートかつメディアプロキシ
		if (file.uri != null && file.userHost != null && this.config.externalMediaProxyEnabled) {
			return this.getProxiedUrl(file.uri, mode);
		}

		// リモートかつ期限切れはローカルプロキシを試みる
		if (file.uri != null && file.isLink && this.config.proxyRemoteFiles) {
			const key = file.webpublicAccessKey;

			if (key && !key.match('/')) {	// 古いものはここにオブジェクトストレージキーが入ってるので除外
				const url = `${this.config.url}/files/${key}`;
				if (mode === 'avatar') return this.getProxiedUrl(file.uri, 'avatar');
				return url;
			}
		}
		const url = file.webpublicUrl ?? file.url;

		if (mode === 'avatar') {
			return this.getProxiedUrl(url, 'avatar');
		}
		return url;
	}

	@bindThis
	public async calcDriveUsageOf(user: MiUser['id'] | { id: MiUser['id'] }): Promise<number> {
		const id = typeof user === 'object' ? user.id : user;
		const result = await this.driveFilesRepository
			.createQueryBuilder('file')
			.select('sum(size) as sum')
			.where({ userId: id, isLink: false })
			.execute();

		return parseInt(result[0].sum, 10) || 0;
	}

	@bindThis
	public async calcDriveUsageOfHost(host: string): Promise<number> {
		const result = await this.driveFilesRepository
			.createQueryBuilder('file')
			.select('sum(size) as sum')
			.where({ userHost: this.utilityService.toPuny(host), isLink: false })
			.execute();

		return parseInt(result[0].sum, 10) || 0;
	}

	@bindThis
	public async calcDriveUsageOfLocal(): Promise<number> {
		const result = await this.driveFilesRepository
			.createQueryBuilder('file')
			.select('sum(size) as sum')
			.where({ userHost: null, isLink: false })
			.execute();

		return parseInt(result[0].sum, 10) || 0;
	}

	@bindThis
	public async calcDriveUsageOfRemote(): Promise<number> {
		const result = await this.driveFilesRepository
			.createQueryBuilder('file')
			.select('sum(size) as sum')
			.where({ userHost: { $ne: null }, isLink: false })
			.execute();

		return parseInt(result[0].sum, 10) || 0;
	}

	@bindThis
	public async pack(
		src: MiDriveFile['id'] | MiDriveFile,
		options?: PackOptions,
	): Promise<Packed<'DriveFile'>> {
		const opts = { detail: false, self: false, ...options };

		const file = typeof src === 'object'
			? src
			: await this.driveFilesRepository.findOneOrFail({ id: src as MiDriveFile['id'] });

		return await awaitAll<Packed<'DriveFile'>>({
			id: file.id,
			createdAt: this.idService.parse(file.id).date.toISOString(),
			name: file.name,
			type: file.type,
			md5: file.md5,
			size: file.size,
			isSensitive: file.isSensitive,
			blurhash: file.blurhash,
			properties: opts.self ? file.properties : this.getPublicProperties(file),
			url: opts.self ? file.url : this.getPublicUrl(file),
			thumbnailUrl: this.getThumbnailUrl(file),
			comment: file.comment,
			folderId: file.folderId,
			folder: opts.detail && file.folderId ? this.driveFolderEntityService.pack(file.folderId, { detail: true }) : null,
			userId: opts.withUser ? file.userId : null,
			user: (opts.withUser && file.userId) ? this.userEntityService.pack(file.userId) : null,
		});
	}

	@bindThis
	public async packNullable(
		src: MiDriveFile['id'] | MiDriveFile,
		options?: PackOptions,
		hint?: { packedUser?: Packed<'UserLite'> },
	): Promise<Packed<'DriveFile'> | null> {
		const opts = { detail: false, self: false, ...options };

		const file = typeof src === 'object' ? src : await this.driveFilesRepository.findOne({ id: src as MiDriveFile['id'] });
		if (file == null) return null;

		return await awaitAll<Packed<'DriveFile'>>({
			id: file.id,
			createdAt: this.idService.parse(file.id).date.toISOString(),
			name: file.name,
			type: file.type,
			md5: file.md5,
			size: file.size,
			isSensitive: file.isSensitive,
			blurhash: file.blurhash,
			properties: opts.self ? file.properties : this.getPublicProperties(file),
			url: opts.self ? file.url : this.getPublicUrl(file),
			thumbnailUrl: this.getThumbnailUrl(file),
			comment: file.comment,
			folderId: file.folderId,
			folder: opts.detail && file.folderId ? this.driveFolderEntityService.pack(file.folderId, { detail: true }) : null,
			userId: file.userId,
			user: (opts.withUser && file.userId) ? hint?.packedUser ?? this.userEntityService.pack(file.userId) : null,
		});
	}

	@bindThis
	public async packMany(
		files: MiDriveFile[],
		options?: PackOptions,
	): Promise<Packed<'DriveFile'>[]> {
		const _user = files.map(({ user, userId }) => user ?? userId).filter(x => x != null);
		const _userMap = await this.userEntityService.packMany(_user)
			.then(users => new Map(users.map(user => [user.id, user])));
		const items = await Promise.all(files.map(f => this.packNullable(f, options, f.userId ? { packedUser: _userMap.get(f.userId) } : {})));
		return items.filter(x => x != null);
	}

	@bindThis
	public async packManyByIdsMap(
		fileIds: MiDriveFile['id'][],
		options?: PackOptions,
	): Promise<Map<Packed<'DriveFile'>['id'], Packed<'DriveFile'> | null>> {
		if (fileIds.length === 0) return new Map();

		const files = await this.driveFilesRepository.find({ id: { $in: fileIds } });
		const packedFiles = await this.packMany(files, options);
		const map = new Map<Packed<'DriveFile'>['id'], Packed<'DriveFile'> | null>(packedFiles.map(f => [f.id, f]));
		for (const id of fileIds) {
			if (!map.has(id)) map.set(id, null);
		}
		return map;
	}

	@bindThis
	public async packManyByIds(
		fileIds: MiDriveFile['id'][],
		options?: PackOptions,
	): Promise<Packed<'DriveFile'>[]> {
		if (fileIds.length === 0) return [];

		const filesMap = await this.packManyByIdsMap(fileIds, options);
		return fileIds.map(id => filesMap.get(id)).filter(x => x != null);
	}
}
