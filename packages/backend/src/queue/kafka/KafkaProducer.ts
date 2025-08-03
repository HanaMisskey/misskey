/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { KafkaJS } from '@confluentinc/kafka-javascript';
const { Kafka, CompressionTypes } = KafkaJS;
type Producer = KafkaJS.Producer;
type ProducerConfig = KafkaJS.ProducerConfig;
type ProducerRecord = KafkaJS.ProducerRecord;
type Message = KafkaJS.Message;
import { v4 as uuid } from 'uuid';
import type { Config } from '@/config.js';
import { ConfluentCompat } from './compat/ConfluentCompat.js';

export class KafkaProducer {
	private kafka: InstanceType<typeof Kafka>;
	private producer: Producer;
	private connected: boolean = false;
	private config: Config;
	private batchQueue: Map<string, Array<any>> = new Map();
	private batchTimers: Map<string, NodeJS.Timeout> = new Map();
	private transactionalProducer?: Producer;

	constructor(config: Config) {
		this.config = config;

		// Create Kafka instance (no config needed for KafkaJS compatibility layer)
		this.kafka = new Kafka();

		// Prepare base configuration
		const baseConfig = {
			clientId: config.queue.kafka?.clientId ?? 'misskey',
			brokers: config.queue.kafka?.brokers ?? ['localhost:9092'],
			ssl: config.queue.kafka?.ssl,
			sasl: config.queue.kafka?.sasl,
			connectionTimeout: config.queue.kafka?.connectionTimeout ?? 30000,
			requestTimeout: config.queue.kafka?.requestTimeout ?? 30000,
			retry: {
				retries: config.queue.kafka?.retry?.retries ?? 5,
				initialRetryTime: config.queue.kafka?.retry?.initialRetryTime ?? 100,
				maxRetryTime: config.queue.kafka?.retry?.maxRetryTime ?? 30000,
			},
			allowAutoTopicCreation: false,
			transactionTimeout: config.queue.kafka?.transactions?.transactionTimeout ?? 30000,
			maxInFlightRequests: 5,
			idempotent: config.queue.kafka?.transactions?.idempotent ?? true,
			compression: CompressionTypes.GZIP,
		};

		// Convert to Confluent format using compatibility layer
		const producerConfig = ConfluentCompat.adaptProducerConfig(baseConfig);

		// Always use Confluent optimized settings
		const optimizedConfig = {
			...producerConfig,
			...ConfluentCompat.getOptimizedSettings('producer'),
		};

		this.producer = this.kafka.producer(optimizedConfig);

		// Create transactional producer if enabled
		if (config.queue.kafka?.transactions?.enabled) {
			const txConfig = {
				...optimizedConfig,
				'transactional.id': `${config.queue.kafka.clientId ?? 'misskey'}-tx-${uuid()}`,
				'enable.idempotence': true,
			};
			this.transactionalProducer = this.kafka.producer(txConfig);
		}
	}

	async connect(): Promise<void> {
		if (this.connected) return;

		await this.producer.connect();

		if (this.transactionalProducer) {
			await this.transactionalProducer.connect();
		}

		this.connected = true;
	}

	async disconnect(): Promise<void> {
		if (!this.connected) return;

		// Flush any pending batches
		await this.flushAllBatches();

		// Clear all batch timers
		for (const timer of this.batchTimers.values()) {
			clearTimeout(timer);
		}
		this.batchTimers.clear();

		await this.producer.disconnect();

		if (this.transactionalProducer) {
			await this.transactionalProducer.disconnect();
		}

		this.connected = false;
	}

	async send(topic: string, messages: Array<{ key?: string; value: any; headers?: Record<string, string> }>): Promise<void> {
		if (!this.connected) {
			await this.connect();
		}

		const kafkaMessages: Message[] = messages.map(msg => ({
			key: msg.key ?? uuid(),
			value: JSON.stringify(msg.value),
			headers: {
				'content-type': 'application/json',
				...msg.headers,
			},
			timestamp: Date.now().toString(),
		}));

		const record: ProducerRecord = {
			topic,
			messages: kafkaMessages,
		};

		await this.producer.send(record);
	}

	async sendBatch(records: Array<{ topic: string; messages: Array<{ key?: string; value: any; headers?: Record<string, string> }> }>): Promise<void> {
		if (!this.connected) {
			await this.connect();
		}

		const kafkaRecords = records.map(record => ({
			topic: record.topic,
			messages: record.messages.map(msg => ({
				key: msg.key ?? uuid(),
				value: JSON.stringify(msg.value),
				headers: {
					'content-type': 'application/json',
					...msg.headers,
				},
				timestamp: Date.now().toString(),
			})),
		}));

		await this.producer.sendBatch({
			topicMessages: kafkaRecords,
		});
	}

	getPartitionKey(queueName: string, data: any): string | undefined {
		// Partitioning strategy based on queue type
		switch (queueName) {
			case 'misskey.deliver':
			case 'misskey.inbox':
				// Partition by domain
				if (data.to) {
					try {
						const url = new URL(data.to);
						return url.hostname;
					} catch {
						return undefined;
					}
				}
				return undefined;

			case 'misskey.relationship':
				// Partition by user ID
				if (data.from?.id) {
					return data.from.id;
				}
				return undefined;

			default:
				// Single partition for other queues
				return undefined;
		}
	}

	async transaction<T>(fn: (tx: Producer) => Promise<T>): Promise<T> {
		if (!this.connected) {
			await this.connect();
		}

		const transaction = await this.producer.transaction();

		try {
			const result = await fn(transaction);
			await transaction.commit();
			return result;
		} catch (error) {
			await transaction.abort();
			throw error;
		}
	}

	async sendBatched(topic: string, message: { key?: string; value: any; headers?: Record<string, string> }): Promise<void> {
		const batchConfig = this.config.queue.kafka?.batching;
		if (!batchConfig?.enabled) {
			// If batching is not enabled, send immediately
			await this.send(topic, [message]);
			return;
		}

		// Add message to batch queue
		if (!this.batchQueue.has(topic)) {
			this.batchQueue.set(topic, []);
		}

		const batch = this.batchQueue.get(topic)!;
		batch.push(message);

		// Check if we should flush the batch
		const shouldFlush =
			batch.length >= (batchConfig.maxBatchSize ?? 100) ||
			this.calculateBatchSize(batch) >= (batchConfig.maxBatchBytes ?? 1048576);

		if (shouldFlush) {
			await this.flushBatch(topic);
		} else {
			// Set up timer to flush batch after delay
			this.scheduleBatchFlush(topic, batchConfig.maxBatchDelay ?? 1000);
		}
	}

	private scheduleBatchFlush(topic: string, delay: number): void {
		// Clear existing timer if any
		if (this.batchTimers.has(topic)) {
			clearTimeout(this.batchTimers.get(topic)!);
		}

		// Set new timer
		const timer = setTimeout(async () => {
			await this.flushBatch(topic);
			this.batchTimers.delete(topic);
		}, delay);

		this.batchTimers.set(topic, timer);
	}

	private async flushBatch(topic: string): Promise<void> {
		const batch = this.batchQueue.get(topic);
		if (!batch || batch.length === 0) return;

		// Clear the batch
		this.batchQueue.set(topic, []);

		// Clear any pending timer
		if (this.batchTimers.has(topic)) {
			clearTimeout(this.batchTimers.get(topic)!);
			this.batchTimers.delete(topic);
		}

		// Send the batch
		await this.send(topic, batch);
	}

	private async flushAllBatches(): Promise<void> {
		const flushPromises: Promise<void>[] = [];

		for (const topic of this.batchQueue.keys()) {
			flushPromises.push(this.flushBatch(topic));
		}

		await Promise.all(flushPromises);
	}

	private calculateBatchSize(batch: Array<any>): number {
		let size = 0;
		for (const message of batch) {
			size += JSON.stringify(message).length;
		}
		return size;
	}

	async transactionalSend(topic: string, messages: Array<{ key?: string; value: any; headers?: Record<string, string> }>): Promise<void> {
		if (!this.transactionalProducer) {
			throw new Error('Transactional producer not initialized. Enable transactions in config.');
		}

		if (!this.connected) {
			await this.connect();
		}

		const transaction = await this.transactionalProducer.transaction();

		try {
			const kafkaMessages: Message[] = messages.map(msg => ({
				key: msg.key ?? uuid(),
				value: JSON.stringify(msg.value),
				headers: {
					'content-type': 'application/json',
					...msg.headers,
				},
				timestamp: Date.now().toString(),
			}));

			await transaction.send({
				topic,
				messages: kafkaMessages,
			});

			await transaction.commit();
		} catch (error) {
			await transaction.abort();
			throw error;
		}
	}

	async transactionalBatch<T>(fn: (ops: {
		send: (topic: string, messages: Array<{ key?: string; value: any; headers?: Record<string, string> }>) => Promise<void>;
		sendToMultipleTopics: (records: Array<{ topic: string; messages: Array<{ key?: string; value: any; headers?: Record<string, string> }> }>) => Promise<void>;
	}) => Promise<T>): Promise<T> {
		if (!this.transactionalProducer) {
			throw new Error('Transactional producer not initialized. Enable transactions in config.');
		}

		if (!this.connected) {
			await this.connect();
		}

		const transaction = await this.transactionalProducer.transaction();

		try {
			const ops = {
				send: async (topic: string, messages: Array<{ key?: string; value: any; headers?: Record<string, string> }>) => {
					const kafkaMessages: Message[] = messages.map(msg => ({
						key: msg.key ?? uuid(),
						value: JSON.stringify(msg.value),
						headers: {
							'content-type': 'application/json',
							...msg.headers,
						},
						timestamp: Date.now().toString(),
					}));

					await transaction.send({
						topic,
						messages: kafkaMessages,
					});
				},
				sendToMultipleTopics: async (records: Array<{ topic: string; messages: Array<{ key?: string; value: any; headers?: Record<string, string> }> }>) => {
					const topicMessages = records.map(record => ({
						topic: record.topic,
						messages: record.messages.map(msg => ({
							key: msg.key ?? uuid(),
							value: JSON.stringify(msg.value),
							headers: {
								'content-type': 'application/json',
								...msg.headers,
							},
							timestamp: Date.now().toString(),
						})),
					}));

					await transaction.sendBatch({
						topicMessages,
					});
				},
			};

			const result = await fn(ops);
			await transaction.commit();
			return result;
		} catch (error) {
			await transaction.abort();
			throw error;
		}
	}
}
