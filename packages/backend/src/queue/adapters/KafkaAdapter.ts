/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { v4 as uuid } from 'uuid';
import { Injectable, Inject } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { KafkaProducer } from '../kafka/KafkaProducer.js';
import { KafkaConsumer } from '../kafka/KafkaConsumer.js';
import { JobTracker } from '../kafka/JobTracker.js';
import { DLQProcessor } from '../kafka/DLQProcessor.js';
import { TopicManager } from '../kafka/TopicManager.js';
import type { QueueAdapter, Job, JobOptions, JobType, QueueStats, QueueMetrics } from './QueueAdapter.js';

@Injectable()
export class KafkaAdapter implements QueueAdapter {
	private producer: KafkaProducer;
	private consumer: KafkaConsumer;
	private jobTracker: JobTracker;
	private dlqProcessor: DLQProcessor;
	private topicManager: TopicManager;
	private processors: Map<string, (job: Job) => Promise<any>> = new Map();
	private processorInstances: Map<string, string> = new Map();
	private cleanupInterval?: NodeJS.Timeout;
	private batchingEnabled: boolean;

	constructor(
		@Inject(DI.config)
		private config: Config,
		
		jobTracker: JobTracker,
	) {
		this.producer = new KafkaProducer(config);
		this.consumer = new KafkaConsumer(config);
		this.jobTracker = jobTracker;
		this.dlqProcessor = new DLQProcessor(config);
		this.topicManager = new TopicManager(config);
		this.batchingEnabled = config.queue.kafka?.batching?.enabled ?? false;
		
		// Start cleanup interval
		this.cleanupInterval = setInterval(() => {
			this.performCleanup();
		}, 60000); // Every minute
		
		// Set up DLQ processor event handlers
		this.setupDLQHandlers();
	}

	async initialize(): Promise<void> {
		// Ensure all required topics exist before connecting
		await this.topicManager.ensureTopicsExist();
		
		await this.producer.connect();
		await this.dlqProcessor.start();
	}

	async close(): Promise<void> {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
		}
		
		// Stop all consumers
		await this.consumer.stop();
		await this.consumer.disconnect();
		
		// Stop DLQ processor
		await this.dlqProcessor.stop();
		
		// Disconnect producer
		await this.producer.disconnect();
	}

	async createJob<T = any>(queueName: string, jobName: string, data: T, opts?: JobOptions): Promise<Job<T>> {
		const jobId = uuid();
		const topic = this.getTopicName(queueName);
		
		// Track job in database
		const dbJob = await this.jobTracker.createJob(
			queueName,
			jobId,
			jobName,
			data,
			opts,
			{
				topic,
				partition: 0, // Will be determined by Kafka
				offset: '0', // Will be set after sending
				key: this.producer.getPartitionKey(topic, data) ?? null,
			}
		);
		
		// Prepare message
		const message = {
			key: dbJob.kafkaKey ?? undefined,
			value: {
				jobId,
				queueName,
				jobName,
				data,
				opts,
				timestamp: Date.now(),
			},
			headers: {
				'job-id': jobId,
				'job-name': jobName,
				'queue-name': queueName,
			},
		};
		
		// Send to Kafka (with batching if enabled)
		if (this.batchingEnabled) {
			await this.producer.sendBatched(topic, message);
		} else {
			await this.producer.send(topic, [message]);
		}
		
		return await this.jobTracker.convertToAdapterJob(dbJob);
	}

	async createBulkJobs<T = any>(queueName: string, jobs: Array<{ name: string; data: T; opts?: JobOptions }>): Promise<Job<T>[]> {
		const topic = this.getTopicName(queueName);
		const dbJobs: Job<T>[] = [];
		
		// Use transaction if enabled
		if (this.config.queue.kafka?.transactions?.enabled) {
			return await this.producer.transactionalBatch(async (ops) => {
				const messages = await Promise.all(jobs.map(async job => {
					const jobId = uuid();
					
					// Track job in database
					const dbJob = await this.jobTracker.createJob(
						queueName,
						jobId,
						job.name,
						job.data,
						job.opts,
						{
							topic,
							partition: 0,
							offset: '0',
							key: this.producer.getPartitionKey(topic, job.data) ?? null,
						}
					);
					
					const adapterJob = await this.jobTracker.convertToAdapterJob(dbJob);
					dbJobs.push(adapterJob);
					
					return {
						key: dbJob.kafkaKey ?? undefined,
						value: {
							jobId,
							queueName,
							jobName: job.name,
							data: job.data,
							opts: job.opts,
							timestamp: Date.now(),
						},
						headers: {
							'job-id': jobId,
							'job-name': job.name,
							'queue-name': queueName,
						},
					};
				}));
				
				await ops.send(topic, messages);
				return dbJobs;
			});
		} else {
			// Non-transactional bulk creation
			const kafkaMessages = await Promise.all(jobs.map(async job => {
				const jobId = uuid();
				
				// Track job in database
				const dbJob = await this.jobTracker.createJob(
					queueName,
					jobId,
					job.name,
					job.data,
					job.opts,
					{
						topic,
						partition: 0,
						offset: '0',
						key: this.producer.getPartitionKey(topic, job.data) ?? null,
					}
				);
				
				const adapterJob = await this.jobTracker.convertToAdapterJob(dbJob);
				dbJobs.push(adapterJob);
				
				return {
					key: dbJob.kafkaKey ?? undefined,
					value: {
						jobId,
						queueName,
						jobName: job.name,
						data: job.data,
						opts: job.opts,
						timestamp: Date.now(),
					},
					headers: {
						'job-id': jobId,
						'job-name': job.name,
						'queue-name': queueName,
					},
				};
			}));
			
			// Send all messages to Kafka
			await this.producer.send(topic, kafkaMessages);
			
			return dbJobs;
		}
	}

	processJobs<T = any>(queueName: string, concurrency: number | string, processor: (job: Job<T>) => Promise<any>): void {
		const topic = this.getTopicName(queueName);
		const groupId = `misskey-${queueName}-processor`;
		const processorId = uuid();
		
		this.processors.set(queueName, processor);
		this.processorInstances.set(queueName, processorId);
		
		// Create consumer group
		this.consumer.createConsumerGroup(
			groupId,
			[topic],
			async (message) => {
				const jobData = message.value;
				const jobId = jobData.jobId;
				
				try {
					// Update job status to active
					await this.jobTracker.updateJobStatus(jobId, 'active', {
						processorId,
						attemptsMade: 1,
					});
					
					// Get the job from database
					const dbJob = await this.jobTracker.getJob(jobId);
					if (!dbJob) {
						throw new Error(`Job ${jobId} not found in database`);
					}
					
					const job = await this.jobTracker.convertToAdapterJob(dbJob);
					
					// Process the job
					const result = await processor(job);
					
					// Update job status to completed
					await this.jobTracker.updateJobStatus(jobId, 'completed', {
						result,
					});
				} catch (error) {
					// Update job status to failed
					await this.jobTracker.updateJobStatus(jobId, 'failed', {
						error: error instanceof Error ? error.message : String(error),
						stacktrace: error instanceof Error && error.stack ? error.stack.split('\n') : [],
					});
					
					// Send to DLQ
					const dlqTopic = `${topic}.dlq`;
					await this.producer.send(dlqTopic, [{
						key: message.key ?? undefined,
						value: message.value,
						headers: {
							...message.headers,
							'original-topic': topic,
							'first-failure-time': Date.now().toString(),
							'last-error': error instanceof Error ? error.message : String(error),
							'retry-count': '0',
						},
					}]);
					
					// Don't re-throw - we've handled the error by sending to DLQ
				}
			},
			{
				fromBeginning: false,
				autoCommit: true,
				autoCommitInterval: 5000,
			}
		).catch(console.error);
	}

	async getJob<T = any>(queueName: string, jobId: string): Promise<Job<T> | null> {
		const dbJob = await this.jobTracker.getJob(jobId);
		return dbJob ? await this.jobTracker.convertToAdapterJob(dbJob) : null;
	}

	async getJobs<T = any>(queueName: string, types: JobType[], start?: number, end?: number): Promise<Job<T>[]> {
		const limit = end ? end - (start ?? 0) : undefined;
		const offset = start;
		
		const jobs: Job<T>[] = [];
		
		for (const type of types) {
			let status: 'pending' | 'active' | 'completed' | 'failed' | 'delayed' | undefined;
			
			switch (type) {
				case 'waiting':
					status = 'pending';
					break;
				case 'active':
					status = 'active';
					break;
				case 'completed':
					status = 'completed';
					break;
				case 'failed':
					status = 'failed';
					break;
				case 'delayed':
					status = 'delayed';
					break;
			}
			
			if (status) {
				const dbJobs = await this.jobTracker.getJobs(queueName, status, limit, offset);
				for (const dbJob of dbJobs) {
					jobs.push(await this.jobTracker.convertToAdapterJob(dbJob));
				}
			}
		}
		
		return jobs;
	}

	async getDelayedJobs<T = any>(queueName: string, start?: number, end?: number): Promise<Job<T>[]> {
		const limit = end ? end - (start ?? 0) : undefined;
		const offset = start;
		
		const dbJobs = await this.jobTracker.getJobs(queueName, 'delayed', limit, offset);
		const jobs: Job<T>[] = [];
		
		for (const dbJob of dbJobs) {
			jobs.push(await this.jobTracker.convertToAdapterJob(dbJob));
		}
		
		return jobs;
	}

	async removeJob(queueName: string, jobId: string): Promise<void> {
		await this.jobTracker.removeJob(jobId);
	}

	async retryJob(queueName: string, jobId: string): Promise<void> {
		await this.jobTracker.retryJob(jobId);
		
		// Re-send to Kafka
		const dbJob = await this.jobTracker.getJob(jobId);
		if (dbJob) {
			const topic = this.getTopicName(queueName);
			await this.producer.send(topic, [{
				key: dbJob.kafkaKey ?? undefined,
				value: {
					jobId: dbJob.jobId,
					queueName: dbJob.queueName,
					jobName: dbJob.jobName,
					data: dbJob.data,
					opts: dbJob.options,
					timestamp: Date.now(),
				},
				headers: {
					'job-id': dbJob.jobId,
					'job-name': dbJob.jobName,
					'queue-name': dbJob.queueName,
					'retry': 'true',
				},
			}]);
		}
	}

	async promoteJobs(queueName: string): Promise<void> {
		const promotedJobs = await this.jobTracker.promoteDelayedJobs(queueName);
		
		// Re-send promoted jobs to Kafka
		if (promotedJobs.length > 0) {
			const topic = this.getTopicName(queueName);
			const messages = promotedJobs.map(job => ({
				key: job.kafkaKey ?? undefined,
				value: {
					jobId: job.jobId,
					queueName: job.queueName,
					jobName: job.jobName,
					data: job.data,
					opts: job.options,
					timestamp: Date.now(),
				},
				headers: {
					'job-id': job.jobId,
					'job-name': job.jobName,
					'queue-name': job.queueName,
					'promoted': 'true',
				},
			}));
			
			await this.producer.send(topic, messages);
		}
	}

	async clearQueue(queueName: string, state?: JobType | '*'): Promise<void> {
		if (state === '*') {
			// Clear all states
			const states: Array<'pending' | 'active' | 'completed' | 'failed' | 'delayed'> = ['pending', 'active', 'completed', 'failed', 'delayed'];
			for (const s of states) {
				const jobs = await this.jobTracker.getJobs(queueName, s);
				for (const job of jobs) {
					await this.jobTracker.removeJob(job.jobId);
				}
			}
		} else if (state) {
			let status: 'pending' | 'active' | 'completed' | 'failed' | 'delayed' | undefined;
			
			switch (state) {
				case 'waiting':
					status = 'pending';
					break;
				case 'active':
					status = 'active';
					break;
				case 'completed':
					status = 'completed';
					break;
				case 'failed':
					status = 'failed';
					break;
				case 'delayed':
					status = 'delayed';
					break;
			}
			
			if (status) {
				const jobs = await this.jobTracker.getJobs(queueName, status);
				for (const job of jobs) {
					await this.jobTracker.removeJob(job.jobId);
				}
			}
		}
	}

	async pauseQueue(queueName: string): Promise<void> {
		const groupId = `misskey-${queueName}-processor`;
		await this.consumer.pause(groupId);
	}

	async resumeQueue(queueName: string): Promise<void> {
		const groupId = `misskey-${queueName}-processor`;
		await this.consumer.resume(groupId);
	}

	async getQueueStats(queueName: string): Promise<QueueStats> {
		const stats = await this.jobTracker.getQueueStats(queueName);
		
		return {
			waiting: stats.pending,
			active: stats.active,
			completed: stats.completed,
			failed: stats.failed,
			delayed: stats.delayed,
			paused: 0, // TODO: Implement paused state tracking
		};
	}

	async getQueueMetrics(queueName: string, type: 'completed' | 'failed', start?: number, end?: number): Promise<QueueMetrics> {
		// TODO: Implement proper metrics collection
		// For now, return mock data
		return {
			completed: {
				count: 0,
				data: [],
			},
			failed: {
				count: 0,
				data: [],
			},
		};
	}

	async isQueuePaused(queueName: string): Promise<boolean> {
		// TODO: Implement pause state tracking
		return false;
	}

	on(queueName: string, event: string, handler: (...args: any[]) => void): void {
		this.consumer.on(event, handler);
	}

	off(queueName: string, event: string, handler: (...args: any[]) => void): void {
		this.consumer.off(event, handler);
	}

	private getTopicName(queueName: string): string {
		// Map queue names to Kafka topics
		const topicMap: Record<string, string> = {
			'system': 'misskey.system',
			'endedPollNotification': 'misskey.endedPollNotification',
			'deliver': 'misskey.deliver',
			'inbox': 'misskey.inbox',
			'db': 'misskey.db',
			'relationship': 'misskey.relationship',
			'objectStorage': 'misskey.objectStorage',
			'userWebhookDeliver': 'misskey.userWebhookDeliver',
			'systemWebhookDeliver': 'misskey.systemWebhookDeliver',
		};
		
		return topicMap[queueName] || `misskey.${queueName}`;
	}

	private async performCleanup(): Promise<void> {
		// Clean up old completed jobs
		const olderThan = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days
		
		for (const processorId of this.processorInstances.values()) {
			// Mark stale jobs as failed
			await this.jobTracker.markJobsAsStale(processorId);
		}
		
		// Clean up old completed jobs for all queues
		const queues = ['system', 'endedPollNotification', 'deliver', 'inbox', 'db', 'relationship', 'objectStorage', 'userWebhookDeliver', 'systemWebhookDeliver'];
		for (const queue of queues) {
			await this.jobTracker.cleanupOldJobs(queue, olderThan);
		}
	}

	private setupDLQHandlers(): void {
		// Handle DLQ metrics
		this.dlqProcessor.on('metrics', (metrics) => {
			// Log or send metrics to monitoring system
			console.log('DLQ Metrics:', metrics);
		});

		// Handle abandoned messages
		this.dlqProcessor.on('message:abandoned', (data) => {
			console.error('Message abandoned after max retries:', data);
			// Could send alert or notification here
		});

		// Handle successful retries
		this.dlqProcessor.on('message:retried', (data) => {
			console.log('Message successfully retried:', data);
		});

		// Handle DLQ errors
		this.dlqProcessor.on('error', (error) => {
			console.error('DLQ processing error:', error);
		});
	}

	// Batch processing methods
	async processBatch<T = any>(
		queueName: string,
		jobs: Array<{ name: string; data: T; opts?: JobOptions }>,
		processor: (jobs: Job<T>[]) => Promise<any>
	): Promise<void> {
		if (!this.config.queue.kafka?.transactions?.enabled) {
			throw new Error('Batch processing requires transactions to be enabled');
		}

		const topic = this.getTopicName(queueName);
		
		await this.producer.transactionalBatch(async (ops) => {
			const dbJobs: Job<T>[] = [];
			const messages = await Promise.all(jobs.map(async job => {
				const jobId = uuid();
				
				const dbJob = await this.jobTracker.createJob(
					queueName,
					jobId,
					job.name,
					job.data,
					job.opts,
					{
						topic,
						partition: 0,
						offset: '0',
						key: this.producer.getPartitionKey(topic, job.data) ?? null,
					}
				);
				
				const adapterJob = await this.jobTracker.convertToAdapterJob(dbJob);
				dbJobs.push(adapterJob);
				
				return {
					key: dbJob.kafkaKey ?? undefined,
					value: {
						jobId,
						queueName,
						jobName: job.name,
						data: job.data,
						opts: job.opts,
						timestamp: Date.now(),
						batch: true,
					},
					headers: {
						'job-id': jobId,
						'job-name': job.name,
						'queue-name': queueName,
						'batch': 'true',
					},
				};
			}));
			
			// Process all jobs as a batch
			try {
				const result = await processor(dbJobs);
				
				// Update all jobs as completed
				for (const job of dbJobs) {
					await this.jobTracker.updateJobStatus(job.id, 'completed', { result });
				}
				
				// Send to Kafka
				await ops.send(topic, messages);
			} catch (error) {
				// Update all jobs as failed
				for (const job of dbJobs) {
					await this.jobTracker.updateJobStatus(job.id, 'failed', {
						error: error instanceof Error ? error.message : String(error),
						stacktrace: error instanceof Error && error.stack ? error.stack.split('\n') : [],
					});
				}
				throw error;
			}
		});
	}

	// Get DLQ metrics
	async getDLQMetrics(): Promise<Record<string, any>> {
		return await this.dlqProcessor.getMetrics();
	}

	// Manually reprocess DLQ messages
	async reprocessDLQ(queueName: string, limit?: number): Promise<number> {
		const topic = `${this.getTopicName(queueName)}.dlq`;
		return await this.dlqProcessor.processBatch(topic, limit);
	}
}