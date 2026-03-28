/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { URL } from 'node:url';
import * as http from 'node:http';
import * as https from 'node:https';
import { Inject, Injectable } from '@nestjs/common';
import {
	AbortMultipartUploadCommand,
	CompleteMultipartUploadCommand,
	CopyObjectCommand,
	CreateMultipartUploadCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	ListMultipartUploadsCommand,
	S3Client,
	UploadPartCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { NodeHttpHandler, NodeHttpHandlerOptions } from '@smithy/node-http-handler';
import type { MiMeta } from '@/models/Meta.js';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { bindThis } from '@/decorators.js';
import type {
	AbortMultipartUploadCommandInput,
	CompleteMultipartUploadCommandInput,
	CopyObjectCommandInput,
	CreateMultipartUploadCommandInput,
	DeleteObjectCommandInput,
	GetObjectCommandInput,
	ListMultipartUploadsCommandInput,
	PutObjectCommandInput,
	UploadPartCommandInput,
} from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';

@Injectable()
export class S3Service {
	constructor(
		@Inject(DI.config)
		private config: Config,

		private httpRequestService: HttpRequestService,
	) {
	}

	@bindThis
	public getS3Client(meta: MiMeta): S3Client {
		const u = meta.objectStorageEndpoint
			? `${meta.objectStorageUseSSL ? 'https' : 'http'}://${meta.objectStorageEndpoint}`
			: `${meta.objectStorageUseSSL ? 'https' : 'http'}://example.net`; // dummy url to select http(s) agent

		const agent = this.httpRequestService.getAgentByUrl(new URL(u), !meta.objectStorageUseProxy, true);
		const handlerOption: NodeHttpHandlerOptions = {};
		if (meta.objectStorageUseSSL) {
			handlerOption.httpsAgent = agent as https.Agent;
		} else {
			handlerOption.httpAgent = agent as http.Agent;
		}

		return new S3Client({
			endpoint: meta.objectStorageEndpoint ? u : undefined,
			credentials: (meta.objectStorageAccessKey !== null && meta.objectStorageSecretKey !== null) ? {
				accessKeyId: meta.objectStorageAccessKey,
				secretAccessKey: meta.objectStorageSecretKey,
			} : undefined,
			region: meta.objectStorageRegion ? meta.objectStorageRegion : undefined, // 空文字列もundefinedにするため ?? は使わない
			tls: meta.objectStorageUseSSL,
			forcePathStyle: meta.objectStorageEndpoint ? meta.objectStorageS3ForcePathStyle : false, // AWS with endPoint omitted
			requestHandler: new NodeHttpHandler(handlerOption),
			requestChecksumCalculation: 'WHEN_REQUIRED',
			responseChecksumValidation: 'WHEN_REQUIRED',
		});
	}

	@bindThis
	public async upload(meta: MiMeta, input: PutObjectCommandInput) {
		const client = this.getS3Client(meta);
		return new Upload({
			client,
			params: input,
			partSize: (client.config.endpoint && (await client.config.endpoint()).hostname === 'storage.googleapis.com')
				? 500 * 1024 * 1024
				: 8 * 1024 * 1024,
		}).done();
	}

	@bindThis
	public delete(meta: MiMeta, input: DeleteObjectCommandInput) {
		const client = this.getS3Client(meta);
		return client.send(new DeleteObjectCommand(input));
	}

	@bindThis
	public deleteWithClient(client: S3Client, input: DeleteObjectCommandInput) {
		return client.send(new DeleteObjectCommand(input));
	}

	@bindThis
	public getStagingS3Client(): S3Client | null {
		const staging = this.config.multipartUploadS3;
		if (!staging) return null;

		const u = staging.endpoint
			? `${staging.useSSL ? 'https' : 'http'}://${staging.endpoint}`
			: `${staging.useSSL ? 'https' : 'http'}://example.net`;

		const agent = this.httpRequestService.getAgentByUrl(new URL(u), !(staging.useProxy ?? false), true);
		const handlerOption: NodeHttpHandlerOptions = {};
		if (staging.useSSL) {
			handlerOption.httpsAgent = agent as https.Agent;
		} else {
			handlerOption.httpAgent = agent as http.Agent;
		}

		return new S3Client({
			endpoint: staging.endpoint ? u : undefined,
			credentials: (staging.accessKey && staging.secretKey) ? {
				accessKeyId: staging.accessKey,
				secretAccessKey: staging.secretKey,
			} : undefined,
			region: staging.region || undefined,
			tls: staging.useSSL ?? false,
			forcePathStyle: staging.endpoint ? (staging.s3ForcePathStyle ?? false) : false,
			requestHandler: new NodeHttpHandler(handlerOption),
			requestChecksumCalculation: 'WHEN_REQUIRED',
			responseChecksumValidation: 'WHEN_REQUIRED',
		});
	}

	@bindThis
	public async createMultipartUpload(client: S3Client, input: CreateMultipartUploadCommandInput): Promise<string> {
		const result = await client.send(new CreateMultipartUploadCommand(input));
		if (!result.UploadId) throw new Error('Failed to create multipart upload: no UploadId returned');
		return result.UploadId;
	}

	@bindThis
	public async uploadPart(client: S3Client, input: UploadPartCommandInput): Promise<string> {
		const result = await client.send(new UploadPartCommand(input));
		if (!result.ETag) throw new Error('Failed to upload part: no ETag returned');
		return result.ETag;
	}

	@bindThis
	public async completeMultipartUpload(client: S3Client, input: CompleteMultipartUploadCommandInput): Promise<void> {
		await client.send(new CompleteMultipartUploadCommand(input));
	}

	@bindThis
	public async abortMultipartUpload(client: S3Client, input: AbortMultipartUploadCommandInput): Promise<void> {
		await client.send(new AbortMultipartUploadCommand(input));
	}

	@bindThis
	public async getObject(client: S3Client, input: GetObjectCommandInput): Promise<Readable> {
		const result = await client.send(new GetObjectCommand(input));
		if (!result.Body) throw new Error('Failed to get object: no Body returned');
		return result.Body as Readable;
	}

	@bindThis
	public async copyObject(client: S3Client, input: CopyObjectCommandInput): Promise<void> {
		await client.send(new CopyObjectCommand(input));
	}

	@bindThis
	public async listMultipartUploads(client: S3Client, input: ListMultipartUploadsCommandInput) {
		return client.send(new ListMultipartUploadsCommand(input));
	}
}
