/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable, Inject } from '@nestjs/common';
import { EventEmitter } from 'events';
import type { Config } from '@/config.js';
import { DI } from '@/di-symbols.js';
import { KafkaConsumer } from './KafkaConsumer.js';
import { KafkaProducer } from './KafkaProducer.js';
import { bindThis } from '@/decorators.js';

export interface DLQMessage {
	topic: string;
	partition: number;
	offset: string;
	key: string | null;
	value: any;
	headers: Record<string, string | undefined>;
	timestamp: string;
	retryCount: number;
	lastError?: string;
	originalTopic: string;
}

export interface DLQMetrics {
	processed: number;
	succeeded: number;
	failed: number;
	abandoned: number;
	currentBacklog: number;
}

@Injectable()
export class DLQProcessor extends EventEmitter {
	private consumer: KafkaConsumer;
	private producer: KafkaProducer;
	private running: boolean = false;
	private processingInterval?: NodeJS.Timeout;
	private metrics: Map<string, DLQMetrics> = new Map();
	private dlqConfig: NonNullable<NonNullable<Config['queue']['kafka']>['dlq']>;

	constructor(
		@Inject(DI.config)
		private config: Config,
	) {
		super();
		this.consumer = new KafkaConsumer(config);
		this.producer = new KafkaProducer(config);
		this.dlqConfig = {
			enabled: config.queue.kafka?.dlq?.enabled ?? true,
			maxRetries: config.queue.kafka?.dlq?.maxRetries ?? 3,
			retryInterval: config.queue.kafka?.dlq?.retryInterval ?? 60000, // 1 minute
			exponentialBackoff: config.queue.kafka?.dlq?.exponentialBackoff ?? true,
			maxRetryDelay: config.queue.kafka?.dlq?.maxRetryDelay ?? 3600000, // 1 hour
			processInterval: config.queue.kafka?.dlq?.processInterval ?? 30000, // 30 seconds
			batchSize: config.queue.kafka?.dlq?.batchSize ?? 100,
		};
	}

	@bindThis
	async start(): Promise<void> {
		if (!this.dlqConfig.enabled || this.running) return;

		await this.producer.connect();
		this.running = true;

		// Subscribe to all DLQ topics
		const dlqTopics = [
			'misskey.system.dlq',
			'misskey.db.dlq',
			'misskey.deliver.dlq',
			'misskey.inbox.dlq',
			'misskey.relationship.dlq',
			'misskey.objectStorage.dlq',
			'misskey.endedPollNotification.dlq',
			'misskey.userWebhookDeliver.dlq',
			'misskey.systemWebhookDeliver.dlq',
		];

		// Initialize metrics
		for (const topic of dlqTopics) {
			this.metrics.set(topic, {
				processed: 0,
				succeeded: 0,
				failed: 0,
				abandoned: 0,
				currentBacklog: 0,
			});
		}

		// Create consumer for DLQ processing
		await this.consumer.createConsumerGroup(
			'misskey-dlq-processor',
			dlqTopics,
			this.handleDLQMessage.bind(this),
			{
				fromBeginning: false,
				autoCommit: false,
				maxBytesPerPartition: 1048576,
			}
		);

		// Start periodic metrics emission
		this.processingInterval = setInterval(() => {
			this.emitMetrics();
		}, this.dlqConfig.processInterval);

		this.emit('started');
	}

	@bindThis
	async stop(): Promise<void> {
		this.running = false;

		if (this.processingInterval) {
			clearInterval(this.processingInterval);
		}

		await this.consumer.stop();
		await this.consumer.disconnect();
		await this.producer.disconnect();

		this.emit('stopped');
	}

	@bindThis
	private async handleDLQMessage(message: {
		topic: string;
		partition: number;
		offset: string;
		key: string | null;
		value: any;
		headers: Record<string, string | undefined>;
		timestamp: string;
	}): Promise<void> {
		const metrics = this.metrics.get(message.topic)!;
		metrics.processed++;

		try {
			// Extract retry information from headers
			const retryCount = parseInt(message.headers['retry-count'] ?? '0', 10);
			const originalTopic = message.headers['original-topic'] ?? message.topic.replace('.dlq', '');
			const lastError = message.headers['last-error'];
			const firstFailureTime = parseInt(message.headers['first-failure-time'] ?? message.timestamp, 10);

			// Check if we should retry
			if (retryCount >= (this.dlqConfig?.maxRetries ?? 3)) {
				// Message has exceeded max retries - abandon it
				metrics.abandoned++;
				await this.handleAbandonedMessage(message, retryCount, lastError);
				return;
			}

			// Calculate retry delay
			const retryDelay = this.calculateRetryDelay(retryCount, firstFailureTime);
			const now = Date.now();

			if (now < retryDelay) {
				// Not ready for retry yet - skip for now
				// The message will remain in the DLQ and be processed later
				return;
			}

			// Attempt to reprocess the message
			await this.retryMessage(message, originalTopic, retryCount);
			metrics.succeeded++;

		} catch (error) {
			metrics.failed++;
			this.emit('error', {
				topic: message.topic,
				offset: message.offset,
				error,
			});

			// Update retry headers and send back to DLQ
			await this.sendBackToDLQ(message, error);
		}
	}

	@bindThis
	private calculateRetryDelay(retryCount: number, firstFailureTime: number): number {
		const baseDelay = this.dlqConfig?.retryInterval ?? 60000;
		
		if (!this.dlqConfig?.exponentialBackoff) {
			return firstFailureTime + (baseDelay * (retryCount + 1));
		}

		// Exponential backoff: delay = min(baseDelay * 2^retryCount, maxRetryDelay)
		const exponentialDelay = baseDelay * Math.pow(2, retryCount);
		const cappedDelay = Math.min(exponentialDelay, this.dlqConfig?.maxRetryDelay ?? 3600000);
		
		return firstFailureTime + cappedDelay;
	}

	@bindThis
	private async retryMessage(
		message: any,
		originalTopic: string,
		retryCount: number
	): Promise<void> {
		// Send the message back to the original topic
		await this.producer.send(originalTopic, [{
			key: message.key,
			value: message.value,
			headers: {
				...message.headers,
				'retry-count': (retryCount + 1).toString(),
				'retry-time': Date.now().toString(),
				'from-dlq': 'true',
			},
		}]);

		this.emit('message:retried', {
			topic: originalTopic,
			retryCount: retryCount + 1,
			messageKey: message.key,
		});
	}

	@bindThis
	private async sendBackToDLQ(
		message: any,
		error: any
	): Promise<void> {
		const retryCount = parseInt(message.headers['retry-count'] ?? '0', 10);
		
		await this.producer.send(message.topic, [{
			key: message.key,
			value: message.value,
			headers: {
				...message.headers,
				'retry-count': (retryCount + 1).toString(),
				'last-error': error?.message || String(error),
				'last-retry-time': Date.now().toString(),
				'first-failure-time': message.headers['first-failure-time'] ?? message.timestamp,
			},
		}]);
	}

	@bindThis
	private async handleAbandonedMessage(
		message: any,
		retryCount: number,
		lastError?: string
	): Promise<void> {
		// Log abandoned message for manual intervention
		this.emit('message:abandoned', {
			topic: message.topic,
			offset: message.offset,
			key: message.key,
			value: message.value,
			retryCount,
			lastError,
			timestamp: message.timestamp,
		});

		// Optionally, send to a permanent failure topic for audit
		const failureTopic = `${message.topic}.permanent-failure`;
		await this.producer.send(failureTopic, [{
			key: message.key,
			value: message.value,
			headers: {
				...message.headers,
				'abandoned-at': Date.now().toString(),
				'total-retries': retryCount.toString(),
				'final-error': lastError || 'Max retries exceeded',
			},
		}]);
	}

	@bindThis
	private emitMetrics(): void {
		const allMetrics: Record<string, DLQMetrics> = {};
		
		for (const [topic, metrics] of this.metrics) {
			allMetrics[topic] = { ...metrics };
		}

		this.emit('metrics', allMetrics);
	}

	@bindThis
	async getMetrics(): Promise<Record<string, DLQMetrics>> {
		const result: Record<string, DLQMetrics> = {};
		
		for (const [topic, metrics] of this.metrics) {
			result[topic] = { ...metrics };
		}

		return result;
	}

	@bindThis
	async processBatch(topic: string, limit: number = 100): Promise<number> {
		// Manual batch processing for a specific DLQ topic
		let processed = 0;
		
		// This would need to be implemented with Kafka's batch consumption
		// For now, returning 0 as placeholder
		
		return processed;
	}

	@bindThis
	async reprocessAll(topic: string): Promise<void> {
		// Reprocess all messages in a specific DLQ
		this.emit('reprocess:started', { topic });
		
		// Implementation would consume all messages from the DLQ
		// and attempt to reprocess them
		
		this.emit('reprocess:completed', { topic });
	}
}