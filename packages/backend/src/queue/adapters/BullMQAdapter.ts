/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Bull from 'bullmq';
import { MetricsTime } from 'bullmq';
import type { QueueAdapter, Job, JobOptions, JobType, QueueStats, QueueMetrics } from './QueueAdapter.js';

export class BullMQAdapter implements QueueAdapter {
	private queues: Map<string, Bull.Queue> = new Map();
	private workers: Map<string, Bull.Worker> = new Map();
	private queueEvents: Map<string, Bull.QueueEvents> = new Map();
	private connection: Bull.ConnectionOptions;

	constructor(connection: Bull.ConnectionOptions) {
		this.connection = connection;
	}

	private getOrCreateQueue(queueName: string): Bull.Queue {
		if (!this.queues.has(queueName)) {
			const queue = new Bull.Queue(queueName, {
				connection: this.connection,
				defaultJobOptions: {
					removeOnComplete: false,
					removeOnFail: false,
				},
			});
			this.queues.set(queueName, queue);
		}
		return this.queues.get(queueName)!;
	}

	private getOrCreateQueueEvents(queueName: string): Bull.QueueEvents {
		if (!this.queueEvents.has(queueName)) {
			const queueEvents = new Bull.QueueEvents(queueName, {
				connection: this.connection,
			});
			this.queueEvents.set(queueName, queueEvents);
		}
		return this.queueEvents.get(queueName)!;
	}

	private convertJobOptions(opts?: JobOptions): Bull.JobsOptions {
		if (!opts) return {};
		
		const bullOpts: Bull.JobsOptions = {};
		
		if (opts.delay !== undefined) bullOpts.delay = opts.delay;
		if (opts.attempts !== undefined) bullOpts.attempts = opts.attempts;
		if (opts.backoff !== undefined) {
			if (typeof opts.backoff === 'object' && 'type' in opts.backoff) {
				// Convert our backoff format to BullMQ format
				if (opts.backoff.type === 'exponential') {
					bullOpts.backoff = {
						type: 'exponential',
						delay: opts.backoff.delay ?? 1000,
					};
				} else if (opts.backoff.type === 'fixed') {
					bullOpts.backoff = {
						type: 'fixed',
						delay: opts.backoff.delay ?? 1000,
					};
				} else {
					// 'custom' type - use exponential as fallback
					bullOpts.backoff = {
						type: 'exponential',
						delay: opts.backoff.delay ?? 1000,
					};
				}
			}
		}
		if (opts.removeOnComplete !== undefined) {
			if (typeof opts.removeOnComplete === 'boolean') {
				bullOpts.removeOnComplete = opts.removeOnComplete;
			} else {
				// Convert our format to BullMQ KeepJobs format
				bullOpts.removeOnComplete = {
					age: opts.removeOnComplete.age,
					count: opts.removeOnComplete.count,
				};
			}
		}
		if (opts.removeOnFail !== undefined) {
			if (typeof opts.removeOnFail === 'boolean') {
				bullOpts.removeOnFail = opts.removeOnFail;
			} else {
				// Convert our format to BullMQ KeepJobs format
				bullOpts.removeOnFail = {
					age: opts.removeOnFail.age,
					count: opts.removeOnFail.count,
				};
			}
		}
		if (opts.repeat !== undefined) bullOpts.repeat = opts.repeat;
		if (opts.priority !== undefined) bullOpts.priority = opts.priority;
		
		return bullOpts;
	}

	private convertBullJob<T = any>(bullJob: Bull.Job<T>): Job<T> {
		return {
			id: bullJob.id!,
			name: bullJob.name,
			data: bullJob.data,
			opts: this.convertBullJobOptions(bullJob.opts),
			timestamp: bullJob.timestamp,
			attemptsMade: bullJob.attemptsMade,
			processedOn: bullJob.processedOn,
			finishedOn: bullJob.finishedOn,
			progress: typeof bullJob.progress === 'string' ? 0 : (bullJob.progress as number | Record<string, any>),
			returnvalue: bullJob.returnvalue,
			failedReason: bullJob.failedReason,
			stacktrace: bullJob.stacktrace,
		};
	}

	private convertBullJobOptions(bullOpts: Bull.JobsOptions): JobOptions {
		const opts: JobOptions = {};
		
		if (bullOpts.delay !== undefined) opts.delay = bullOpts.delay;
		if (bullOpts.attempts !== undefined) opts.attempts = bullOpts.attempts;
		
		// Convert BullMQ backoff to our format
		if (bullOpts.backoff !== undefined) {
			if (typeof bullOpts.backoff === 'number') {
				opts.backoff = {
					type: 'fixed',
					delay: bullOpts.backoff,
				};
			} else if (typeof bullOpts.backoff === 'object' && bullOpts.backoff !== null) {
				opts.backoff = {
					type: bullOpts.backoff.type as 'fixed' | 'exponential' | 'custom',
					delay: bullOpts.backoff.delay,
				};
			}
		}
		
		// Convert BullMQ removeOnComplete to our format
		if (bullOpts.removeOnComplete !== undefined) {
			if (typeof bullOpts.removeOnComplete === 'boolean') {
				opts.removeOnComplete = bullOpts.removeOnComplete;
			} else if (typeof bullOpts.removeOnComplete === 'number') {
				opts.removeOnComplete = {
					count: bullOpts.removeOnComplete,
				};
			} else if (typeof bullOpts.removeOnComplete === 'object' && bullOpts.removeOnComplete !== null) {
				opts.removeOnComplete = {
					age: bullOpts.removeOnComplete.age,
					count: bullOpts.removeOnComplete.count,
				};
			}
		}
		
		// Convert BullMQ removeOnFail to our format
		if (bullOpts.removeOnFail !== undefined) {
			if (typeof bullOpts.removeOnFail === 'boolean') {
				opts.removeOnFail = bullOpts.removeOnFail;
			} else if (typeof bullOpts.removeOnFail === 'number') {
				opts.removeOnFail = {
					count: bullOpts.removeOnFail,
				};
			} else if (typeof bullOpts.removeOnFail === 'object' && bullOpts.removeOnFail !== null) {
				opts.removeOnFail = {
					age: bullOpts.removeOnFail.age,
					count: bullOpts.removeOnFail.count,
				};
			}
		}
		
		if (bullOpts.repeat !== undefined) opts.repeat = bullOpts.repeat;
		if (bullOpts.priority !== undefined) opts.priority = bullOpts.priority;
		
		return opts;
	}

	async createJob<T = any>(queueName: string, jobName: string, data: T, opts?: JobOptions): Promise<Job<T>> {
		const queue = this.getOrCreateQueue(queueName);
		const bullJob = await queue.add(jobName, data, this.convertJobOptions(opts));
		return this.convertBullJob(bullJob);
	}

	async createBulkJobs<T = any>(queueName: string, jobs: Array<{ name: string; data: T; opts?: JobOptions }>): Promise<Job<T>[]> {
		const queue = this.getOrCreateQueue(queueName);
		const bullJobs = await queue.addBulk(
			jobs.map(job => ({
				name: job.name,
				data: job.data,
				opts: this.convertJobOptions(job.opts),
			}))
		);
		return bullJobs.map(job => this.convertBullJob(job));
	}

	processJobs<T = any>(queueName: string, concurrency: number | string, processor: (job: Job<T>) => Promise<any>): void {
		if (this.workers.has(queueName)) {
			throw new Error(`Worker already exists for queue ${queueName}`);
		}

		const worker = new Bull.Worker(queueName, async (bullJob: Bull.Job<T>) => {
			const job = this.convertBullJob(bullJob);
			return await processor(job);
		}, {
			connection: this.connection,
			concurrency: typeof concurrency === 'string' ? parseInt(concurrency, 10) : concurrency,
		});

		this.workers.set(queueName, worker);
	}

	async getJob<T = any>(queueName: string, jobId: string): Promise<Job<T> | null> {
		const queue = this.getOrCreateQueue(queueName);
		const bullJob = await queue.getJob(jobId);
		return bullJob ? this.convertBullJob(bullJob) : null;
	}

	async getJobs<T = any>(queueName: string, types: JobType[], start?: number, end?: number): Promise<Job<T>[]> {
		const queue = this.getOrCreateQueue(queueName);
		const bullJobs = await queue.getJobs(types as any[], start, end);
		return bullJobs.map(job => this.convertBullJob(job));
	}

	async getDelayedJobs<T = any>(queueName: string, start?: number, end?: number): Promise<Job<T>[]> {
		const queue = this.getOrCreateQueue(queueName);
		const bullJobs = await queue.getDelayed(start, end);
		return bullJobs.map(job => this.convertBullJob(job));
	}

	async removeJob(queueName: string, jobId: string): Promise<void> {
		const queue = this.getOrCreateQueue(queueName);
		const job = await queue.getJob(jobId);
		if (job) {
			await job.remove();
		}
	}

	async retryJob(queueName: string, jobId: string): Promise<void> {
		const queue = this.getOrCreateQueue(queueName);
		const job = await queue.getJob(jobId);
		if (job) {
			if (job.finishedOn != null) {
				await job.retry();
			} else {
				await job.promote();
			}
		}
	}

	async promoteJobs(queueName: string): Promise<void> {
		const queue = this.getOrCreateQueue(queueName);
		await queue.promoteJobs();
	}

	async clearQueue(queueName: string, state?: JobType | '*'): Promise<void> {
		const queue = this.getOrCreateQueue(queueName);
		
		if (state === '*' || state === undefined) {
			await Promise.all([
				queue.clean(0, 0, 'completed'),
				queue.clean(0, 0, 'wait'),
				queue.clean(0, 0, 'active'),
				queue.clean(0, 0, 'paused'),
				queue.clean(0, 0, 'prioritized'),
				queue.clean(0, 0, 'delayed'),
				queue.clean(0, 0, 'failed'),
			]);
		} else {
			await queue.clean(0, 0, state as any);
		}
	}

	async pauseQueue(queueName: string): Promise<void> {
		const queue = this.getOrCreateQueue(queueName);
		await queue.pause();
	}

	async resumeQueue(queueName: string): Promise<void> {
		const queue = this.getOrCreateQueue(queueName);
		await queue.resume();
	}

	async getQueueStats(queueName: string): Promise<QueueStats> {
		const queue = this.getOrCreateQueue(queueName);
		const counts = await queue.getJobCounts();
		
		return {
			waiting: counts.waiting,
			active: counts.active,
			completed: counts.completed,
			failed: counts.failed,
			delayed: counts.delayed,
			paused: counts.paused,
		};
	}

	async getQueueMetrics(queueName: string, type: 'completed' | 'failed', start?: number, end?: number): Promise<QueueMetrics> {
		const queue = this.getOrCreateQueue(queueName);
		const metricsCompleted = await queue.getMetrics('completed', start ?? 0, end ?? MetricsTime.ONE_WEEK);
		const metricsFailed = await queue.getMetrics('failed', start ?? 0, end ?? MetricsTime.ONE_WEEK);
		
		// Convert BullMQ metrics format to our QueueMetrics format
		const convertMetrics = (metrics: Bull.Metrics) => ({
			count: metrics.count,
			data: metrics.data.map((value, index) => ({
				timestamp: Date.now() - (metrics.data.length - index - 1) * 60000, // Approximate timestamps
				value: value,
			})),
		});
		
		return {
			completed: convertMetrics(metricsCompleted),
			failed: convertMetrics(metricsFailed),
		};
	}

	async isQueuePaused(queueName: string): Promise<boolean> {
		const queue = this.getOrCreateQueue(queueName);
		return await queue.isPaused();
	}

	async initialize(): Promise<void> {
		// BullMQ doesn't require explicit initialization
	}

	async close(): Promise<void> {
		// Close all workers
		for (const worker of this.workers.values()) {
			await worker.close();
		}
		this.workers.clear();

		// Close all queue events
		for (const queueEvents of this.queueEvents.values()) {
			await queueEvents.close();
		}
		this.queueEvents.clear();

		// Close all queues
		for (const queue of this.queues.values()) {
			await queue.close();
		}
		this.queues.clear();
	}

	on(queueName: string, event: string, handler: (...args: any[]) => void): void {
		const queueEvents = this.getOrCreateQueueEvents(queueName);
		queueEvents.on(event as any, handler);
	}

	off(queueName: string, event: string, handler: (...args: any[]) => void): void {
		const queueEvents = this.getOrCreateQueueEvents(queueName);
		queueEvents.off(event as any, handler);
	}
}