/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID, createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { IActivity } from '@/core/activitypub/type.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiWebhook, webhookEventTypes } from '@/models/Webhook.js';
import type { MiSystemWebhook, SystemWebhookEventType } from '@/models/SystemWebhook.js';
import type { Config } from '@/config.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import type { Antenna } from '@/server/api/endpoints/i/import-antennas.js';
import type { DbJobData, DeliverJobData, InboxJobData, RelationshipJobData, SystemWebhookDeliverJobData, ThinUser, UserWebhookDeliverJobData } from '../queue/types.js';
import type httpSignature from '@peertube/http-signature';
import type { QueueAdapter } from '@/queue/adapters/QueueAdapter.js';
import { QUEUE } from '@/queue/const.js';

export const QUEUE_TYPES = ['system', 'endedPollNotification', 'deliver', 'inbox', 'db', 'relationship', 'objectStorage', 'userWebhookDeliver', 'systemWebhookDeliver'] as const;

@Injectable()
export class QueueServiceAdapter {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject('queue:adapter')
		private queueAdapter: QueueAdapter,
	) {
		// Initialize adapter
		this.queueAdapter.initialize().then(() => {
			// Add cron jobs for system queue
			this.addSystemCronJobs();
		});
	}

	@bindThis
	private addSystemCronJobs() {
		const cronJobs = [
			{ name: 'tickCharts', pattern: '55 * * * *' },
			{ name: 'resyncCharts', pattern: '0 0 * * *' },
			{ name: 'cleanCharts', pattern: '0 0 * * *' },
			{ name: 'aggregateRetention', pattern: '0 0 * * *' },
			{ name: 'clean', pattern: '0 0 * * *' },
			{ name: 'checkExpiredMutings', pattern: '*/5 * * * *' },
			{ name: 'bakeBufferedReactions', pattern: '0 0 * * *' },
			{ name: 'checkModeratorsActivity', pattern: '30 * * * *' },
		];

		for (const job of cronJobs) {
			this.queueAdapter.createJob(QUEUE.SYSTEM, job.name, {}, {
				repeat: { pattern: job.pattern },
				removeOnComplete: { count: 10 },
				removeOnFail: { count: 30 },
			});
		}
	}

	@bindThis
	public deliver(user: ThinUser, content: IActivity | null, to: string | null, isSharedInbox: boolean) {
		if (content == null) return null;
		if (to == null) return null;

		const contentBody = JSON.stringify(content);
		const digest = this.createDigest(contentBody);

		const data: DeliverJobData = {
			user: {
				id: user.id,
			},
			content: contentBody,
			digest,
			to,
			isSharedInbox,
		};

		const label = to.replace('https://', '').replace('/inbox', '');

		return this.queueAdapter.createJob(QUEUE.DELIVER, label, data, {
			attempts: this.config.deliverJobMaxAttempts ?? 12,
			backoff: {
				type: 'custom',
			},
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		});
	}

	@bindThis
	public async deliverMany(user: ThinUser, content: IActivity | null, inboxes: Map<string, boolean>) {
		if (content == null) return null;
		const contentBody = JSON.stringify(content);
		const digest = this.createDigest(contentBody);

		const opts = {
			attempts: this.config.deliverJobMaxAttempts ?? 12,
			backoff: {
				type: 'custom' as const,
			},
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		};

		const jobs = Array.from(inboxes.entries()).map(d => ({
			name: d[0].replace('https://', '').replace('/inbox', ''),
			data: {
				user,
				content: contentBody,
				digest,
				to: d[0],
				isSharedInbox: d[1],
			} as DeliverJobData,
			opts,
		}));

		await this.queueAdapter.createBulkJobs(QUEUE.DELIVER, jobs);
		return;
	}

	@bindThis
	public inbox(activity: IActivity, signature: httpSignature.IParsedSignature) {
		const data = {
			activity: activity,
			signature,
		};

		const label = (activity.id ?? '').replace('https://', '').replace('/activity', '');

		return this.queueAdapter.createJob(QUEUE.INBOX, label, data, {
			attempts: this.config.inboxJobMaxAttempts ?? 8,
			backoff: {
				type: 'custom',
			},
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		});
	}

	@bindThis
	public createDeleteDriveFilesJob(user: ThinUser) {
		return this.queueAdapter.createJob(QUEUE.DB, 'deleteDriveFiles', {
			user: { id: user.id },
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		});
	}

	// Add all other queue methods following the same pattern...
	// (The full implementation would include all methods from QueueService)

	@bindThis
	public async queueClear(queueType: typeof QUEUE_TYPES[number]) {
		await this.queueAdapter.clearQueue(queueType);
	}

	@bindThis
	public async queuePromoteJobs(queueType: typeof QUEUE_TYPES[number]) {
		await this.queueAdapter.promoteJobs(queueType);
	}

	@bindThis
	public async queueRetryJob(queueType: typeof QUEUE_TYPES[number], jobId: string) {
		await this.queueAdapter.retryJob(queueType, jobId);
	}

	@bindThis
	public async queueRemoveJob(queueType: typeof QUEUE_TYPES[number], jobId: string) {
		await this.queueAdapter.removeJob(queueType, jobId);
	}

	@bindThis
	public async queueGetJob(queueType: typeof QUEUE_TYPES[number], jobId: string) {
		const job = await this.queueAdapter.getJob(queueType, jobId);
		if (job) {
			return this.packJobData(job);
		} else {
			throw new Error(`Job not found: ${jobId}`);
		}
	}

	@bindThis
	public async queueGetJobs(queueType: typeof QUEUE_TYPES[number], jobTypes: Array<'completed' | 'waiting' | 'active' | 'delayed' | 'failed' | 'paused' | 'prioritized'>, search?: string) {
		const RETURN_LIMIT = 100;
		let jobs = await this.queueAdapter.getJobs(queueType, jobTypes, 0, RETURN_LIMIT);

		if (search) {
			jobs = jobs.filter(job => {
				const jobString = JSON.stringify(job).toLowerCase();
				return search.toLowerCase().split(' ').every(term => {
					return jobString.includes(term);
				});
			});
		}

		return jobs.map(job => this.packJobData(job));
	}

	@bindThis
	public async queueGetQueues() {
		const fetchings = QUEUE_TYPES.map(async type => {
			const stats = await this.queueAdapter.getQueueStats(type);
			const isPaused = await this.queueAdapter.isQueuePaused(type);
			const metrics = await this.queueAdapter.getQueueMetrics(type, 'completed');

			return {
				name: type,
				counts: stats,
				isPaused,
				metrics,
			};
		});

		return await Promise.all(fetchings);
	}

	@bindThis
	public async queueGetQueue(queueType: typeof QUEUE_TYPES[number]) {
		const stats = await this.queueAdapter.getQueueStats(queueType);
		const isPaused = await this.queueAdapter.isQueuePaused(queueType);
		const metrics = await this.queueAdapter.getQueueMetrics(queueType, 'completed');

		return {
			name: queueType,
			qualifiedName: queueType,
			counts: stats,
			isPaused,
			metrics,
		};
	}

	@bindThis
	private createDigest(body: string): string {
		return `SHA-256=${createHash('sha256').update(body).digest('base64')}`;
	}

	@bindThis
	private packJobData(job: any): any {
		const stacktrace = job.stacktrace ? job.stacktrace.filter(Boolean) : [];
		stacktrace.reverse();

		return {
			id: job.id,
			name: job.name,
			data: job.data,
			opts: job.opts,
			timestamp: job.timestamp,
			processedOn: job.processedOn,
			processedBy: job.processedBy,
			finishedOn: job.finishedOn,
			progress: job.progress,
			attempts: job.attemptsMade,
			delay: job.opts?.delay,
			failedReason: job.failedReason,
			stacktrace: stacktrace,
			returnValue: job.returnvalue,
			isFailed: !!job.failedReason || (Array.isArray(stacktrace) && stacktrace.length > 0),
		};
	}
}