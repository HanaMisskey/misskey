/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { KafkaJS } from '@confluentinc/kafka-javascript';
const { Kafka } = KafkaJS;
type Consumer = KafkaJS.Consumer;
type ConsumerConfig = KafkaJS.ConsumerConfig;
type ConsumerSubscribeTopics = KafkaJS.ConsumerSubscribeTopics;
type EachMessagePayload = KafkaJS.EachMessagePayload;
type KafkaMessage = KafkaJS.KafkaMessage;
import { EventEmitter } from 'events';
import type { Config } from '@/config.js';
import { ConfluentCompat } from './compat/ConfluentCompat.js';

export interface KafkaMessageHandler {
	(message: {
		topic: string;
		partition: number;
		offset: string;
		key: string | null;
		value: any;
		headers: Record<string, string | undefined>;
		timestamp: string;
	}): Promise<void>;
}

export class KafkaConsumer extends EventEmitter {
	private kafka: InstanceType<typeof Kafka>;
	private consumers: Map<string, Consumer> = new Map();
	private config: Config;
	private running: boolean = false;

	constructor(config: Config) {
		super();
		this.config = config;
		
		// Create Kafka instance (no config needed for KafkaJS compatibility layer)
		this.kafka = new Kafka();
	}

	async createConsumerGroup(
		groupId: string,
		topics: string[],
		handler: KafkaMessageHandler,
		options?: {
			fromBeginning?: boolean;
			sessionTimeout?: number;
			heartbeatInterval?: number;
			maxBytesPerPartition?: number;
			minBytes?: number;
			maxBytes?: number;
			maxWaitTimeInMs?: number;
			autoCommit?: boolean;
			autoCommitInterval?: number;
			autoCommitThreshold?: number;
		}
	): Promise<void> {
		// Prepare base configuration
		const baseConfig = {
			clientId: this.config.queue.kafka?.clientId ?? 'misskey',
			brokers: this.config.queue.kafka?.brokers ?? ['localhost:9092'],
			ssl: this.config.queue.kafka?.ssl,
			sasl: this.config.queue.kafka?.sasl,
			connectionTimeout: this.config.queue.kafka?.connectionTimeout ?? 30000,
			requestTimeout: this.config.queue.kafka?.requestTimeout ?? 30000,
			groupId,
			sessionTimeout: options?.sessionTimeout ?? 30000,
			heartbeatInterval: options?.heartbeatInterval ?? 3000,
			maxBytesPerPartition: options?.maxBytesPerPartition ?? 1048576, // 1MB
			minBytes: options?.minBytes ?? 1,
			maxBytes: options?.maxBytes ?? 10485760, // 10MB
			maxWaitTimeInMs: options?.maxWaitTimeInMs ?? 5000,
			retry: {
				retries: 5,
				initialRetryTime: 100,
				maxRetryTime: 30000,
			},
			allowAutoTopicCreation: false,
			autoCommit: options?.autoCommit ?? true,
			autoCommitInterval: options?.autoCommitInterval ?? 5000,
			autoCommitThreshold: options?.autoCommitThreshold ?? 100,
		};

		// Convert to Confluent format using compatibility layer
		const consumerConfig = ConfluentCompat.adaptConsumerConfig(baseConfig);

		// Always use Confluent optimized settings
		const optimizedConfig = {
			...consumerConfig,
			...ConfluentCompat.getOptimizedSettings('consumer'),
		};

		const consumer = this.kafka.consumer(optimizedConfig);
		this.consumers.set(groupId, consumer);

		await consumer.connect();

		// Subscribe to each topic separately
		for (const topic of topics) {
			await consumer.subscribe({ 
				topic,
				// @ts-ignore - fromBeginning is a valid option in kafkajs compatibility mode
				fromBeginning: options?.fromBeginning ?? false,
			});
		}

		await consumer.run({
			eachMessage: async (payload: EachMessagePayload) => {
				const { topic, partition, message } = payload;
				
				try {
					const parsedValue = message.value ? JSON.parse(message.value.toString()) : null;
					const headers: Record<string, string | undefined> = {};
					
					for (const [key, value] of Object.entries(message.headers ?? {})) {
						headers[key] = value?.toString();
					}

					await handler({
						topic,
						partition,
						offset: message.offset,
						key: message.key?.toString() ?? null,
						value: parsedValue,
						headers,
						timestamp: message.timestamp,
					});

					this.emit('message:processed', {
						topic,
						partition,
						offset: message.offset,
					});
				} catch (error) {
					this.emit('message:error', {
						topic,
						partition,
						offset: message.offset,
						error,
					});
					
					// Re-throw to trigger retry mechanism
					throw error;
				}
			},
		});

		this.running = true;
	}

	async pause(groupId: string, topics?: string[]): Promise<void> {
		const consumer = this.consumers.get(groupId);
		if (!consumer) {
			throw new Error(`Consumer group ${groupId} not found`);
		}

		// @ts-ignore - assignment() method exists in kafkajs
		const assignment = consumer.assignment ? consumer.assignment() : [];
		const topicPartitions = topics
			? assignment.filter((tp: any) => topics.includes(tp.topic))
			: assignment;

		consumer.pause(topicPartitions);
	}

	async resume(groupId: string, topics?: string[]): Promise<void> {
		const consumer = this.consumers.get(groupId);
		if (!consumer) {
			throw new Error(`Consumer group ${groupId} not found`);
		}

		// @ts-ignore - assignment() method exists in kafkajs
		const assignment = consumer.assignment ? consumer.assignment() : [];
		const topicPartitions = topics
			? assignment.filter((tp: any) => topics.includes(tp.topic))
			: assignment;

		consumer.resume(topicPartitions);
	}

	async seek(groupId: string, topic: string, partition: number, offset: string): Promise<void> {
		const consumer = this.consumers.get(groupId);
		if (!consumer) {
			throw new Error(`Consumer group ${groupId} not found`);
		}

		await consumer.seek({ topic, partition, offset });
	}

	async commitOffsets(groupId: string, offsets: Array<{ topic: string; partition: number; offset: string }>): Promise<void> {
		const consumer = this.consumers.get(groupId);
		if (!consumer) {
			throw new Error(`Consumer group ${groupId} not found`);
		}

		await consumer.commitOffsets(
			offsets.map(o => ({
				topic: o.topic,
				partition: o.partition,
				offset: (parseInt(o.offset, 10) + 1).toString(),
			}))
		);
	}

	async disconnect(groupId?: string): Promise<void> {
		if (groupId) {
			const consumer = this.consumers.get(groupId);
			if (consumer) {
				await consumer.disconnect();
				this.consumers.delete(groupId);
			}
		} else {
			// Disconnect all consumers
			for (const [id, consumer] of this.consumers) {
				await consumer.disconnect();
				this.consumers.delete(id);
			}
			this.running = false;
		}
	}

	async stop(): Promise<void> {
		this.running = false;
		
		// Stop all consumers
		const stopPromises: Promise<void>[] = [];
		for (const consumer of this.consumers.values()) {
			stopPromises.push(consumer.stop());
		}
		
		await Promise.all(stopPromises);
	}

	isRunning(): boolean {
		return this.running;
	}

	getConsumerGroups(): string[] {
		return Array.from(this.consumers.keys());
	}

	async describeGroup(groupId: string): Promise<any> {
		const admin = this.kafka.admin();
		await admin.connect();
		
		try {
			const groups = await admin.describeGroups([groupId]);
			return groups.groups[0];
		} finally {
			await admin.disconnect();
		}
	}

	async fetchOffsets(groupId: string, topics: string[]): Promise<Array<{ topic: string; partition: number; offset: string }>> {
		const admin = this.kafka.admin();
		await admin.connect();
		
		try {
			const offsets = await admin.fetchOffsets({ groupId, topics });
			const result: Array<{ topic: string; partition: number; offset: string }> = [];
			
			for (const topicOffset of offsets) {
				for (const partitionOffset of topicOffset.partitions) {
					result.push({
						topic: topicOffset.topic,
						partition: partitionOffset.partition,
						offset: partitionOffset.offset,
					});
				}
			}
			
			return result;
		} finally {
			await admin.disconnect();
		}
	}
}