import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as Path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import type { S3Client } from '@aws-sdk/client-s3';
import { DI } from '@/di-symbols.js';
import type { MiMeta } from '@/models/Meta.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiUser } from '@/models/User.js';
import { S3Service } from '@/core/S3Service.js';
import { DriveService } from '@/core/DriveService.js';
import { AppLockService } from '@/core/AppLockService.js';
import { InternalStorageService } from '@/core/InternalStorageService.js';
import { contentDisposition } from '@/misc/content-disposition.js';
import { FILE_TYPE_BROWSERSAFE } from '@/const.js';
import { createTemp } from '@/misc/create-temp.js';
import { bindThis } from '@/decorators.js';
import Logger from '@/logger.js';

const SESSION_PREFIX = 'multipart-upload:session:';
const PARTS_PREFIX = 'multipart-upload:parts:';
const ETAG_PREFIX = 'multipart-upload:etag:';
const PARTPATH_PREFIX = 'multipart-upload:partpath:';
const SESSION_TTL = 60 * 60; // 1 hour

// Lua script for atomic part reservation (idempotency + size check + session existence)
// Returns: 1 = already uploaded (idempotent), 0 = reserved, -1 = size exceeded, -2 = session expired
const RESERVE_PART_SCRIPT = `
local exists = redis.call('EXISTS', KEYS[2])
if exists == 0 then return -2 end
local already = redis.call('SISMEMBER', KEYS[1], ARGV[1])
if already == 1 then return 1 end
local currentSize = tonumber(redis.call('HGET', KEYS[2], 'uploadedSize')) or 0
if currentSize + tonumber(ARGV[2]) > tonumber(ARGV[3]) then return -1 end
redis.call('SADD', KEYS[1], ARGV[1])
redis.call('HINCRBY', KEYS[2], 'uploadedSize', tonumber(ARGV[2]))
return 0
`;

// Lua script to rollback a failed part reservation
const ROLLBACK_PART_SCRIPT = `
redis.call('SREM', KEYS[1], ARGV[1])
redis.call('HINCRBY', KEYS[2], 'uploadedSize', -tonumber(ARGV[2]))
return 0
`;

type SessionData = {
	userId: string;
	fileName: string | null;
	totalParts: number;
	comment: string | null;
	folderId: string | null;
	isSensitive: boolean;
	force: boolean;
	storageType: 's3' | 'local';
	s3UploadId: string | null;
	s3Key: string | null;
	s3Bucket: string | null;
	useStaging: boolean;
	uploadedSize: number;
	maxFileSize: number;
	createdAt: number;
};

@Injectable()
export class MultipartUploadService {
	private logger: Logger;

	constructor(
		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		private s3Service: S3Service,
		private driveService: DriveService,
		private appLockService: AppLockService,
		private internalStorageService: InternalStorageService,
	) {
		this.logger = new Logger('multipart-upload', 'cyan');
	}

	/** Get S3 client for initial session creation (uses live meta) */
	@bindThis
	private getS3ClientForNewSession(): { client: S3Client; bucket: string; useStaging: boolean } {
		if (this.meta.objectStorageStagingBucket) {
			const client = this.s3Service.getStagingS3Client(this.meta);
			if (client) {
				return { client, bucket: this.meta.objectStorageStagingBucket, useStaging: true };
			}
		}

		const client = this.s3Service.getS3Client(this.meta);
		return { client, bucket: this.meta.objectStorageBucket!, useStaging: false };
	}

	/** Get S3 client from session state (uses persisted bucket/staging info) */
	@bindThis
	private getS3ClientFromSession(session: SessionData): { client: S3Client; bucket: string } {
		if (session.useStaging) {
			const client = this.s3Service.getStagingS3Client(this.meta);
			if (client) {
				return { client, bucket: session.s3Bucket! };
			}
		}

		const client = this.s3Service.getS3Client(this.meta);
		return { client, bucket: session.s3Bucket! };
	}

	@bindThis
	private generateS3Key(): string {
		// No extension: MIME is unknown at session creation time.
		// Extension-inferring providers (e.g. upcloud) could serve unsafe content types
		// if we preserved the user-supplied extension here. The normal upload path
		// in DriveService.save() also strips extensions for non-browser-safe types.
		const prefix = this.meta.objectStoragePrefix ? `${this.meta.objectStoragePrefix}/` : '';
		return `${prefix}${randomUUID()}`;
	}

	@bindThis
	private getChunkDir(): string {
		const chunkDir = Path.resolve(Path.dirname(this.internalStorageService.resolvePath('dummy')), 'multipart-chunks');
		fs.mkdirSync(chunkDir, { recursive: true });
		return chunkDir;
	}

	@bindThis
	private assertPipelineSuccess(results: [error: Error | null, result: unknown][] | null): void {
		if (results?.some(([err]) => err !== null)) {
			const firstErr = results.find(([err]) => err !== null)?.[0];
			throw new Error(`Redis pipeline failed: ${firstErr?.message}`);
		}
	}

	@bindThis
	public async createSession(userId: string, params: {
		fileName: string | null;
		totalParts: number;
		totalSize: number | null;
		comment: string | null;
		folderId: string | null;
		isSensitive: boolean;
		force: boolean;
		maxFileSize: number;
	}): Promise<{ sessionId: string }> {
		const sessionId = randomUUID();
		const useObjectStorage = this.meta.useObjectStorage;

		let s3UploadId: string | null = null;
		let s3Key: string | null = null;
		let s3Bucket: string | null = null;
		let useStaging = false;

		if (useObjectStorage) {
			const { client, bucket, useStaging: staging } = this.getS3ClientForNewSession();
			useStaging = staging;
			s3Bucket = bucket;

			s3Key = this.generateS3Key();
			s3UploadId = await this.s3Service.createMultipartUpload(client, {
				Bucket: bucket,
				Key: s3Key,
				// Set metadata that we know at creation time
				CacheControl: 'max-age=31536000, immutable',
				ACL: this.meta.objectStorageSetPublicRead ? 'public-read' : undefined,
			});

			this.logger.info(`Created S3 multipart upload: ${s3UploadId} (staging: ${useStaging})`);
		}

		const session: Record<string, string> = {
			userId,
			fileName: params.fileName ?? '',
			totalParts: String(params.totalParts),
			comment: params.comment ?? '',
			folderId: params.folderId ?? '',
			isSensitive: String(params.isSensitive),
			force: String(params.force),
			storageType: useObjectStorage ? 's3' : 'local',
			s3UploadId: s3UploadId ?? '',
			s3Key: s3Key ?? '',
			s3Bucket: s3Bucket ?? '',
			useStaging: String(useStaging),
			uploadedSize: '0',
			maxFileSize: String(params.maxFileSize),
			createdAt: String(Date.now()),
		};

		const pipe = this.redisClient.pipeline();
		pipe.hset(SESSION_PREFIX + sessionId, session);
		pipe.expire(SESSION_PREFIX + sessionId, SESSION_TTL);
		try {
			this.assertPipelineSuccess(await pipe.exec());
		} catch (err) {
			// Compensate: abort the S3 multipart upload if Redis failed
			if (s3UploadId && s3Key && s3Bucket) {
				const { client } = this.getS3ClientForNewSession();
				try {
					await this.s3Service.abortMultipartUpload(client, { Bucket: s3Bucket, Key: s3Key, UploadId: s3UploadId });
				} catch { /* best effort */ }
			}
			throw err;
		}

		this.logger.info(`Session created: ${sessionId} for user ${userId}, totalParts: ${params.totalParts}`);

		return { sessionId };
	}

	@bindThis
	private async getSession(sessionId: string): Promise<SessionData | null> {
		const data = await this.redisClient.hgetall(SESSION_PREFIX + sessionId);
		if (!data || !data.userId) return null;

		return {
			userId: data.userId,
			fileName: data.fileName || null,
			totalParts: parseInt(data.totalParts, 10),
			comment: data.comment || null,
			folderId: data.folderId || null,
			isSensitive: data.isSensitive === 'true',
			force: data.force === 'true',
			storageType: data.storageType as 's3' | 'local',
			s3UploadId: data.s3UploadId || null,
			s3Key: data.s3Key || null,
			s3Bucket: data.s3Bucket || null,
			useStaging: data.useStaging === 'true',
			uploadedSize: parseInt(data.uploadedSize, 10),
			maxFileSize: parseInt(data.maxFileSize, 10),
			createdAt: parseInt(data.createdAt, 10),
		};
	}

	@bindThis
	private async validateSessionOwnership(sessionId: string, userId: string): Promise<SessionData> {
		const session = await this.getSession(sessionId);
		if (!session) {
			throw new Error('SESSION_NOT_FOUND');
		}
		if (session.userId !== userId) {
			throw new Error('SESSION_OWNER_MISMATCH');
		}
		return session;
	}

	@bindThis
	public async uploadPart(sessionId: string, userId: string, partNumber: number, filePath: string, fileSize: number): Promise<{ partNumber: number; done: boolean }> {
		const session = await this.validateSessionOwnership(sessionId, userId);

		if (partNumber < 1 || partNumber > session.totalParts) {
			throw new Error('INVALID_PART_NUMBER');
		}

		// Atomic reservation: idempotency check + size check + SADD + HINCRBY
		const reserveResult = await this.redisClient.eval(
			RESERVE_PART_SCRIPT,
			2,
			PARTS_PREFIX + sessionId,
			SESSION_PREFIX + sessionId,
			String(partNumber),
			String(fileSize),
			String(session.maxFileSize),
		) as number;

		if (reserveResult === -2) {
			throw new Error('SESSION_NOT_FOUND');
		}

		if (reserveResult === 1) {
			// Already uploaded (idempotent)
			const receivedCount = await this.redisClient.scard(PARTS_PREFIX + sessionId);
			return { partNumber, done: receivedCount >= session.totalParts };
		}

		if (reserveResult === -1) {
			throw new Error('MAX_FILE_SIZE_EXCEEDED');
		}

		// reserveResult === 0: reserved, proceed with upload
		try {
			if (session.storageType === 's3') {
				const { client, bucket } = this.getS3ClientFromSession(session);

				const etag = await this.s3Service.uploadPart(client, {
					Bucket: bucket,
					Key: session.s3Key!,
					UploadId: session.s3UploadId!,
					PartNumber: partNumber,
					Body: fs.createReadStream(filePath),
				});

				// Store ETag + refresh all TTLs (session, parts set, AND all existing ETag keys)
				const pipe = this.redisClient.pipeline();
				pipe.set(ETAG_PREFIX + sessionId + ':' + partNumber, etag, 'EX', SESSION_TTL);
				pipe.expire(PARTS_PREFIX + sessionId, SESSION_TTL);
				pipe.expire(SESSION_PREFIX + sessionId, SESSION_TTL);
				// Refresh TTL on all previously uploaded ETag keys
				for (let p = 1; p <= session.totalParts; p++) {
					if (p !== partNumber) {
						pipe.expire(ETAG_PREFIX + sessionId + ':' + p, SESSION_TTL);
					}
				}
				this.assertPipelineSuccess(await pipe.exec());
			} else {
				// Local storage: save chunk to shared directory
				const chunkDir = this.getChunkDir();
				const chunkPath = Path.join(chunkDir, `${sessionId}-part-${partNumber}`);
				fs.copyFileSync(filePath, chunkPath);

				const pipe = this.redisClient.pipeline();
				pipe.set(PARTPATH_PREFIX + sessionId + ':' + partNumber, chunkPath, 'EX', SESSION_TTL);
				pipe.expire(PARTS_PREFIX + sessionId, SESSION_TTL);
				pipe.expire(SESSION_PREFIX + sessionId, SESSION_TTL);
				// Refresh TTL on all previously uploaded path keys
				for (let p = 1; p <= session.totalParts; p++) {
					if (p !== partNumber) {
						pipe.expire(PARTPATH_PREFIX + sessionId + ':' + p, SESSION_TTL);
					}
				}
				this.assertPipelineSuccess(await pipe.exec());
			}
		} catch (err) {
			// Rollback the reservation on upload failure
			await this.redisClient.eval(
				ROLLBACK_PART_SCRIPT,
				2,
				PARTS_PREFIX + sessionId,
				SESSION_PREFIX + sessionId,
				String(partNumber),
				String(fileSize),
			).catch(() => { /* best effort rollback */ });
			throw err;
		}

		const receivedCount = await this.redisClient.scard(PARTS_PREFIX + sessionId);
		this.logger.info(`Part ${partNumber}/${session.totalParts} uploaded for session ${sessionId}`);

		return { partNumber, done: receivedCount >= session.totalParts };
	}

	@bindThis
	public async completeUpload(sessionId: string, user: { id: MiUser['id']; host: MiUser['host'] }, ip: string | null, headers: Record<string, string> | null): Promise<MiDriveFile> {
		// Pre-check (may be stale, re-validated after lock)
		await this.validateSessionOwnership(sessionId, user.id);

		// Distributed lock to prevent concurrent completion
		const unlock = await this.appLockService.getLock(`multipart-complete:${sessionId}`, 60 * 1000);

		try {
			// Re-validate after lock acquisition (another request may have completed/aborted)
			const session = await this.validateSessionOwnership(sessionId, user.id);

			const receivedCount = await this.redisClient.scard(PARTS_PREFIX + sessionId);
			if (receivedCount < session.totalParts) {
				throw new Error('INCOMPLETE_PARTS');
			}

			let driveFile: MiDriveFile;
			if (session.storageType === 's3') {
				driveFile = await this.completeS3Upload(sessionId, session, user, ip, headers);
			} else {
				driveFile = await this.completeLocalUpload(sessionId, session, user, ip, headers);
			}

			// Cleanup only on success
			await this.cleanupSession(sessionId, session);
			return driveFile;
		} finally {
			await unlock();
			// Session is NOT cleaned up on failure — allows retry
		}
	}

	@bindThis
	private async completeS3Upload(
		sessionId: string,
		session: SessionData,
		user: { id: MiUser['id']; host: MiUser['host'] },
		ip: string | null,
		headers: Record<string, string> | null,
	): Promise<MiDriveFile> {
		// Collect ETags
		const parts: { ETag: string; PartNumber: number }[] = [];
		for (let i = 1; i <= session.totalParts; i++) {
			const etag = await this.redisClient.get(ETAG_PREFIX + sessionId + ':' + i);
			if (!etag) throw new Error(`Missing ETag for part ${i}`);
			parts.push({ ETag: etag, PartNumber: i });
		}

		const { client, bucket } = this.getS3ClientFromSession(session);

		// Complete the S3 multipart upload
		await this.s3Service.completeMultipartUpload(client, {
			Bucket: bucket,
			Key: session.s3Key!,
			UploadId: session.s3UploadId!,
			MultipartUpload: { Parts: parts },
		});

		this.logger.info(`S3 multipart upload completed: ${session.s3Key}`);

		// Download the completed file to temp for analysis
		const [tempPath, tempCleanup] = await createTemp();
		try {
			const objectStream = await this.s3Service.getObject(client, {
				Bucket: bucket,
				Key: session.s3Key!,
			});
			await pipeline(objectStream, fs.createWriteStream(tempPath));

			if (session.useStaging) {
				// Staging S3: pass to addFile which will upload to production S3
				let driveFile: MiDriveFile;
				try {
					driveFile = await this.driveService.addFile({
						user,
						path: tempPath,
						name: session.fileName,
						comment: session.comment,
						folderId: session.folderId,
						force: session.force,
						sensitive: session.isSensitive,
						requestIp: ip,
						requestHeaders: headers,
					});
				} catch (err) {
					// addFile failed — compensate by deleting orphaned staging object
					this.logger.warn(`addFile failed after staging S3 complete, cleaning up: ${session.s3Key}`);
					try {
						await this.s3Service.deleteWithClient(client, { Bucket: bucket, Key: session.s3Key! });
					} catch (e) {
						this.logger.error(`Failed to delete orphaned staging object: ${session.s3Key}`, e as Error);
					}
					throw err;
				}

				// Delete from staging S3 on success
				try {
					await this.s3Service.deleteWithClient(client, { Bucket: bucket, Key: session.s3Key! });
				} catch (e) {
					this.logger.warn(`Failed to delete staging object: ${session.s3Key}`, e as Error);
				}

				return driveFile;
			} else {
				// Direct S3: file is already on production S3, skip re-upload
				const baseUrl = this.meta.objectStorageBaseUrl
					?? `${this.meta.objectStorageUseSSL ? 'https' : 'http'}://${this.meta.objectStorageEndpoint}${this.meta.objectStoragePort ? `:${this.meta.objectStoragePort}` : ''}/${this.meta.objectStorageBucket}`;
				const s3Url = `${baseUrl}/${session.s3Key}`;

				let driveFile: MiDriveFile;
				try {
					driveFile = await this.driveService.addFile({
						user,
						path: tempPath,
						name: session.fileName,
						comment: session.comment,
						folderId: session.folderId,
						force: session.force,
						sensitive: session.isSensitive,
						requestIp: ip,
						requestHeaders: headers,
						s3Multipart: {
							skipOriginalUpload: true,
							s3Key: session.s3Key!,
							s3Url,
						},
					});
				} catch (err) {
					// addFile failed after S3 complete — compensate by deleting the orphaned object
					this.logger.warn(`addFile failed after S3 complete, cleaning up orphaned object: ${session.s3Key}`);
					try {
						await this.s3Service.deleteWithClient(client, { Bucket: bucket, Key: session.s3Key! });
					} catch (e) {
						this.logger.error(`Failed to delete orphaned S3 object: ${session.s3Key}`, e as Error);
					}
					throw err;
				}

				// Update S3 object metadata (ContentType, ContentDisposition) now that we know the actual type
				// Apply the same MIME hardening as DriveService.upload()
				let contentType = driveFile.type;
				if (contentType === 'image/apng') contentType = 'image/png';
				if (!FILE_TYPE_BROWSERSAFE.includes(contentType)) contentType = 'application/octet-stream';

				try {
					await this.s3Service.copyObject(client, {
						Bucket: bucket,
						Key: session.s3Key!,
						CopySource: `${bucket}/${session.s3Key}`,
						ContentType: contentType,
						CacheControl: 'max-age=31536000, immutable',
						ContentDisposition: contentDisposition(
							'inline',
							driveFile.name,
						),
						ACL: this.meta.objectStorageSetPublicRead ? 'public-read' : undefined,
						MetadataDirective: 'REPLACE',
					});
				} catch (e) {
					// Metadata hardening is security-critical — if it fails, delete the unsafe object
					this.logger.error(`Failed to update S3 object metadata, deleting unsafe object: ${session.s3Key}`, e as Error);
					try {
						await this.s3Service.deleteWithClient(client, { Bucket: bucket, Key: session.s3Key! });
					} catch { /* best effort */ }
					// Also delete the DB record
					throw new Error(`S3 metadata update failed for ${session.s3Key}`);
				}

				return driveFile;
			}
		} finally {
			tempCleanup();
		}
	}

	@bindThis
	private async completeLocalUpload(
		sessionId: string,
		session: SessionData,
		user: { id: MiUser['id']; host: MiUser['host'] },
		ip: string | null,
		headers: Record<string, string> | null,
	): Promise<MiDriveFile> {
		// Assemble chunks into a single temp file
		const [tempPath, tempCleanup] = await createTemp();
		try {
			const writeStream = fs.createWriteStream(tempPath);
			for (let i = 1; i <= session.totalParts; i++) {
				const chunkPath = await this.redisClient.get(PARTPATH_PREFIX + sessionId + ':' + i);
				if (!chunkPath) throw new Error(`Missing chunk path for part ${i}`);

				const chunkStream = fs.createReadStream(chunkPath);
				await pipeline(chunkStream, writeStream, { end: false });
			}
			writeStream.end();
			await new Promise<void>((resolve, reject) => {
				writeStream.on('finish', resolve);
				writeStream.on('error', reject);
			});

			const driveFile = await this.driveService.addFile({
				user,
				path: tempPath,
				name: session.fileName,
				comment: session.comment,
				folderId: session.folderId,
				force: session.force,
				sensitive: session.isSensitive,
				requestIp: ip,
				requestHeaders: headers,
			});

			// Clean up chunk files on success
			for (let i = 1; i <= session.totalParts; i++) {
				const chunkPath = await this.redisClient.get(PARTPATH_PREFIX + sessionId + ':' + i);
				if (chunkPath) {
					try { fs.unlinkSync(chunkPath); } catch { /* ignore */ }
				}
			}

			return driveFile;
		} finally {
			tempCleanup();
		}
	}

	@bindThis
	public async abortUpload(sessionId: string, userId: string): Promise<void> {
		const session = await this.validateSessionOwnership(sessionId, userId);

		// Use the same lock as completeUpload to prevent abort/complete races
		const unlock = await this.appLockService.getLock(`multipart-complete:${sessionId}`, 30 * 1000);

		try {
			// Re-validate after lock (may have been completed by another request)
			const freshSession = await this.getSession(sessionId);
			if (!freshSession) {
				// Already cleaned up (completed or aborted by another request)
				return;
			}

			if (freshSession.storageType === 's3' && freshSession.s3UploadId && freshSession.s3Key) {
				const { client, bucket } = this.getS3ClientFromSession(freshSession);
				try {
					await this.s3Service.abortMultipartUpload(client, {
						Bucket: bucket,
						Key: freshSession.s3Key,
						UploadId: freshSession.s3UploadId,
					});
				} catch (e) {
					this.logger.warn(`Failed to abort S3 multipart upload: ${freshSession.s3UploadId}`, e as Error);
				}
			} else if (freshSession.storageType === 'local') {
				for (let i = 1; i <= freshSession.totalParts; i++) {
					const chunkPath = await this.redisClient.get(PARTPATH_PREFIX + sessionId + ':' + i);
					if (chunkPath) {
						try { fs.unlinkSync(chunkPath); } catch { /* ignore */ }
					}
				}
			}

			await this.cleanupSession(sessionId, freshSession);
			this.logger.info(`Session aborted: ${sessionId}`);
		} finally {
			await unlock();
		}
	}

	@bindThis
	private async cleanupSession(sessionId: string, session: SessionData): Promise<void> {
		const pipe = this.redisClient.pipeline();
		pipe.del(SESSION_PREFIX + sessionId);
		pipe.del(PARTS_PREFIX + sessionId);

		for (let i = 1; i <= session.totalParts; i++) {
			pipe.del(ETAG_PREFIX + sessionId + ':' + i);
			pipe.del(PARTPATH_PREFIX + sessionId + ':' + i);
		}

		await pipe.exec();
	}
}
