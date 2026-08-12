import * as fs from 'node:fs';
import * as Path from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import type { S3Client } from '@aws-sdk/client-s3';
import { DI } from '@/di-symbols.js';
import type { MiMeta } from '@/models/Meta.js';
import { S3Service } from '@/core/S3Service.js';
import { InternalStorageService } from '@/core/InternalStorageService.js';
import { bindThis } from '@/decorators.js';
import type Logger from '@/logger.js';
import { QueueLoggerService } from '../QueueLoggerService.js';

const MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class CleanExpiredMultipartUploadsProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.meta)
		private meta: MiMeta,

		private s3Service: S3Service,
		private internalStorageService: InternalStorageService,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('clean-expired-multipart-uploads');
	}

	@bindThis
	public async process(): Promise<void> {
		this.logger.info('Cleaning expired multipart uploads...');

		const localCount = await this.cleanLocalChunks();
		const s3Count = this.meta.useObjectStorage ? await this.cleanS3Uploads() : 0;

		this.logger.succ(`Cleaned ${localCount} local chunks, ${s3Count} S3 uploads.`);
	}

	@bindThis
	private async cleanLocalChunks(): Promise<number> {
		const chunkDir = Path.resolve(
			Path.dirname(this.internalStorageService.resolvePath('dummy')),
			'multipart-chunks',
		);

		if (!fs.existsSync(chunkDir)) return 0;

		const now = Date.now();
		let count = 0;

		for (const file of fs.readdirSync(chunkDir)) {
			try {
				const filePath = Path.join(chunkDir, file);
				const stat = fs.statSync(filePath);
				if (now - stat.mtimeMs > MAX_AGE_MS) {
					fs.unlinkSync(filePath);
					count++;
				}
			} catch {
				// ignore individual file errors
			}
		}

		if (count > 0) {
			this.logger.info(`Deleted ${count} expired local chunk files.`);
		}

		return count;
	}

	@bindThis
	private async cleanS3Uploads(): Promise<number> {
		// Determine which S3 client(s) to use
		const targets: { client: S3Client; bucket: string; label: string }[] = [];

		// Production S3
		targets.push({
			client: this.s3Service.getS3Client(this.meta),
			bucket: this.meta.objectStorageBucket!,
			label: 'production',
		});

		// Staging S3 (if configured)
		if (this.meta.objectStorageStagingBucket) {
			const stagingClient = this.s3Service.getStagingS3Client(this.meta);
			if (stagingClient) {
				targets.push({
					client: stagingClient,
					bucket: this.meta.objectStorageStagingBucket,
					label: 'staging',
				});
			}
		}

		let totalAborted = 0;
		const now = Date.now();

		for (const target of targets) {
			try {
				const prefix = this.meta.objectStoragePrefix ? `${this.meta.objectStoragePrefix}/` : '';
				const result = await this.s3Service.listMultipartUploads(target.client, {
					Bucket: target.bucket,
					Prefix: prefix || undefined,
				});

				if (!result.Uploads || result.Uploads.length === 0) continue;

				for (const upload of result.Uploads) {
					if (!upload.UploadId || !upload.Key || !upload.Initiated) continue;

					const age = now - upload.Initiated.getTime();
					if (age > MAX_AGE_MS) {
						try {
							await this.s3Service.abortMultipartUpload(target.client, {
								Bucket: target.bucket,
								Key: upload.Key,
								UploadId: upload.UploadId,
							});
							totalAborted++;
							this.logger.info(`Aborted expired S3 multipart upload: ${upload.Key} (${target.label})`);
						} catch (e) {
							this.logger.warn(`Failed to abort S3 upload ${upload.UploadId}: ${(e as Error).message}`);
						}
					}
				}
			} catch (e) {
				this.logger.warn(`Failed to list multipart uploads for ${target.label}: ${(e as Error).message}`);
			}
		}

		return totalAborted;
	}
}
