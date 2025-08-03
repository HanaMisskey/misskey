/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable, Inject } from '@nestjs/common';
import { DataSource, Repository, LessThan, MoreThan } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { MiQueueJob } from '@/models/QueueJob.js';
import type { Job, JobOptions } from '../adapters/QueueAdapter.js';

@Injectable()
export class JobTracker {
	constructor(
		@Inject(DI.db)
		private db: DataSource,

		@Inject(DI.queueJobsRepository)
		private queueJobsRepository: Repository<MiQueueJob>,
	) {}

	async createJob(
		queueName: string,
		jobId: string,
		jobName: string,
		data: any,
		options?: JobOptions,
		kafkaMetadata?: {
			topic: string;
			partition: number;
			offset: string;
			key: string | null;
		}
	): Promise<MiQueueJob> {
		const job = await this.queueJobsRepository.save({
			id: jobId,
			jobId,
			queueName,
			jobName,
			data,
			options,
			status: 'pending',
			attemptsMade: 0,
			maxAttempts: options?.attempts,
			scheduledFor: options?.delay ? new Date(Date.now() + options.delay) : null,
			kafkaTopic: kafkaMetadata?.topic,
			kafkaPartition: kafkaMetadata?.partition,
			kafkaOffset: kafkaMetadata?.offset,
			kafkaKey: kafkaMetadata?.key,
		});

		return job;
	}

	async updateJobStatus(
		jobId: string,
		status: 'active' | 'completed' | 'failed' | 'delayed',
		updates?: {
			error?: string;
			stacktrace?: string[];
			result?: any;
			progress?: number;
			processorId?: string;
			attemptsMade?: number;
		}
	): Promise<void> {
		const updateData: Partial<MiQueueJob> = {
			status,
			updatedAt: new Date(),
		};

		if (status === 'active') {
			updateData.processedAt = new Date();
		} else if (status === 'completed') {
			updateData.completedAt = new Date();
		} else if (status === 'failed') {
			updateData.failedAt = new Date();
		}

		if (updates) {
			Object.assign(updateData, updates);
		}

		await this.queueJobsRepository.update({ jobId }, updateData);
	}

	async getJob(jobId: string): Promise<MiQueueJob | null> {
		return await this.queueJobsRepository.findOne({
			where: { jobId },
		});
	}

	async getJobs(
		queueName: string,
		status?: 'pending' | 'active' | 'completed' | 'failed' | 'delayed',
		limit?: number,
		offset?: number
	): Promise<MiQueueJob[]> {
		const query = this.queueJobsRepository.createQueryBuilder('job')
			.where('job.queueName = :queueName', { queueName });

		if (status) {
			query.andWhere('job.status = :status', { status });
		}

		if (limit) {
			query.take(limit);
		}

		if (offset) {
			query.skip(offset);
		}

		query.orderBy('job.createdAt', 'DESC');

		return await query.getMany();
	}

	async getDelayedJobs(queueName: string, now: Date = new Date()): Promise<MiQueueJob[]> {
		return await this.queueJobsRepository.find({
			where: {
				queueName,
				status: 'delayed',
				scheduledFor: LessThan(now),
			},
			order: {
				scheduledFor: 'ASC',
			},
		});
	}

	async cleanupOldJobs(queueName: string, olderThan: Date): Promise<number> {
		const result = await this.queueJobsRepository.delete({
			queueName,
			status: 'completed',
			completedAt: LessThan(olderThan),
		});

		return result.affected ?? 0;
	}

	async getQueueStats(queueName: string): Promise<{
		pending: number;
		active: number;
		completed: number;
		failed: number;
		delayed: number;
	}> {
		const stats = await this.queueJobsRepository
			.createQueryBuilder('job')
			.select('job.status', 'status')
			.addSelect('COUNT(*)', 'count')
			.where('job.queueName = :queueName', { queueName })
			.groupBy('job.status')
			.getRawMany();

		const result = {
			pending: 0,
			active: 0,
			completed: 0,
			failed: 0,
			delayed: 0,
		};

		for (const stat of stats) {
			result[stat.status as keyof typeof result] = parseInt(stat.count, 10);
		}

		return result;
	}

	async markJobsAsStale(processorId: string, staleAfter: number = 300000): Promise<number> {
		// Mark jobs that have been processing for too long as failed
		const staleTime = new Date(Date.now() - staleAfter);
		
		const result = await this.queueJobsRepository.update(
			{
				processorId,
				status: 'active',
				processedAt: LessThan(staleTime),
			},
			{
				status: 'failed',
				failedAt: new Date(),
				error: 'Job processing timed out',
			}
		);

		return result.affected ?? 0;
	}

	async promoteDelayedJobs(queueName: string): Promise<MiQueueJob[]> {
		const now = new Date();
		const delayedJobs = await this.getDelayedJobs(queueName, now);

		if (delayedJobs.length > 0) {
			const jobIds = delayedJobs.map(job => job.id);
			
			await this.queueJobsRepository.update(
				{
					id: jobIds as any,
				},
				{
					status: 'pending',
					scheduledFor: null,
				}
			);
		}

		return delayedJobs;
	}

	async retryJob(jobId: string): Promise<void> {
		const job = await this.getJob(jobId);
		if (!job) {
			throw new Error(`Job ${jobId} not found`);
		}

		await this.queueJobsRepository.update(
			{ jobId },
			{
				status: 'pending',
				error: null,
				stacktrace: null,
				failedAt: null,
				processedAt: null,
				completedAt: null,
			}
		);
	}

	async removeJob(jobId: string): Promise<void> {
		await this.queueJobsRepository.delete({ jobId });
	}

	async convertToAdapterJob(dbJob: MiQueueJob): Promise<Job> {
		return {
			id: dbJob.jobId,
			name: dbJob.jobName,
			data: dbJob.data,
			opts: dbJob.options || {},
			timestamp: dbJob.createdAt.getTime(),
			attemptsMade: dbJob.attemptsMade,
			processedOn: dbJob.processedAt?.getTime(),
			finishedOn: dbJob.completedAt?.getTime() || dbJob.failedAt?.getTime(),
			progress: dbJob.progress || 0,
			returnvalue: dbJob.result,
			failedReason: dbJob.error ?? undefined,
			stacktrace: dbJob.stacktrace ?? undefined,
		};
	}
}