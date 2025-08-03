/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable, Inject } from '@nestjs/common';
import { KafkaJS } from '@confluentinc/kafka-javascript';
import type { Config } from '@/config.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';

const { Kafka } = KafkaJS;

export interface TopicConfiguration {
	name: string;
	partitions: number;
	replicationFactor: number;
	configs?: Record<string, string>;
}

@Injectable()
export class TopicManager {
	private kafka: InstanceType<typeof Kafka>;
	
	constructor(
		@Inject(DI.config)
		private config: Config,
	) {
		// Create Kafka instance with proper configuration
		// Use the KafkaJS compatibility layer from confluent-kafka-javascript
		this.kafka = new Kafka({
			kafkaJS: {
				brokers: config.queue.kafka?.brokers ?? ['localhost:9092'],
				clientId: config.queue.kafka?.clientId ?? 'misskey-topic-manager',
			}
		});
	}

	@bindThis
	async ensureTopicsExist(): Promise<void> {
		const admin = this.kafka.admin();
		
		try {
			await admin.connect();
			
			// Get list of required topics
			const requiredTopics = this.getRequiredTopics();
			
			// Get existing topics
			const existingTopics = await admin.listTopics();
			
			// Find topics that don't exist
			const topicsToCreate = requiredTopics.filter(topic => 
				!existingTopics.includes(topic.name)
			);
			
			if (topicsToCreate.length > 0) {
				console.log(`Creating ${topicsToCreate.length} missing Kafka topics...`);
				
				await admin.createTopics({
					topics: topicsToCreate.map(topic => ({
						topic: topic.name,
						numPartitions: topic.partitions,
						replicationFactor: topic.replicationFactor,
						configEntries: Object.entries(topic.configs || {}).map(([key, value]) => ({
							name: key,
							value,
						})),
					})),
				});
				
				console.log(`Successfully created topics: ${topicsToCreate.map(t => t.name).join(', ')}`);
			} else {
				console.log('All required Kafka topics already exist');
			}
		} catch (error) {
			console.error('Failed to ensure Kafka topics exist:', error);
			throw error;
		} finally {
			await admin.disconnect();
		}
	}

	@bindThis
	private getRequiredTopics(): TopicConfiguration[] {
		const defaultConfigs = {
			'retention.ms': '604800000', // 7 days
			'segment.ms': '86400000',    // 1 day
		};

		const dlqConfigs = {
			'retention.ms': '2592000000', // 30 days for DLQ
		};

		return [
			// Main queue topics
			{
				name: 'misskey.system',
				partitions: 1,
				replicationFactor: this.getReplicationFactor(),
				configs: defaultConfigs,
			},
			{
				name: 'misskey.db',
				partitions: 1,
				replicationFactor: this.getReplicationFactor(),
				configs: defaultConfigs,
			},
			{
				name: 'misskey.deliver',
				partitions: 12,
				replicationFactor: this.getReplicationFactor(),
				configs: defaultConfigs,
			},
			{
				name: 'misskey.inbox',
				partitions: 12,
				replicationFactor: this.getReplicationFactor(),
				configs: defaultConfigs,
			},
			{
				name: 'misskey.relationship',
				partitions: 6,
				replicationFactor: this.getReplicationFactor(),
				configs: defaultConfigs,
			},
			{
				name: 'misskey.objectStorage',
				partitions: 3,
				replicationFactor: this.getReplicationFactor(),
				configs: defaultConfigs,
			},
			{
				name: 'misskey.endedPollNotification',
				partitions: 1,
				replicationFactor: this.getReplicationFactor(),
				configs: defaultConfigs,
			},
			{
				name: 'misskey.userWebhookDeliver',
				partitions: 3,
				replicationFactor: this.getReplicationFactor(),
				configs: defaultConfigs,
			},
			{
				name: 'misskey.systemWebhookDeliver',
				partitions: 1,
				replicationFactor: this.getReplicationFactor(),
				configs: defaultConfigs,
			},
			
			// Dead Letter Queue topics
			{
				name: 'misskey.system.dlq',
				partitions: 1,
				replicationFactor: this.getReplicationFactor(),
				configs: dlqConfigs,
			},
			{
				name: 'misskey.db.dlq',
				partitions: 1,
				replicationFactor: this.getReplicationFactor(),
				configs: dlqConfigs,
			},
			{
				name: 'misskey.deliver.dlq',
				partitions: 1,
				replicationFactor: this.getReplicationFactor(),
				configs: dlqConfigs,
			},
			{
				name: 'misskey.inbox.dlq',
				partitions: 1,
				replicationFactor: this.getReplicationFactor(),
				configs: dlqConfigs,
			},
			{
				name: 'misskey.relationship.dlq',
				partitions: 1,
				replicationFactor: this.getReplicationFactor(),
				configs: dlqConfigs,
			},
			{
				name: 'misskey.objectStorage.dlq',
				partitions: 1,
				replicationFactor: this.getReplicationFactor(),
				configs: dlqConfigs,
			},
			{
				name: 'misskey.endedPollNotification.dlq',
				partitions: 1,
				replicationFactor: this.getReplicationFactor(),
				configs: dlqConfigs,
			},
			{
				name: 'misskey.userWebhookDeliver.dlq',
				partitions: 1,
				replicationFactor: this.getReplicationFactor(),
				configs: dlqConfigs,
			},
			{
				name: 'misskey.systemWebhookDeliver.dlq',
				partitions: 1,
				replicationFactor: this.getReplicationFactor(),
				configs: dlqConfigs,
			},
		];
	}

	@bindThis
	private getReplicationFactor(): number {
		// Use configuration or default to 1 for single-node setups
		return this.config.queue.kafka?.replicationFactor ?? 1;
	}

	@bindThis
	async getTopicInfo(topicName: string): Promise<any> {
		const admin = this.kafka.admin();
		
		try {
			await admin.connect();
			
			const metadata = await admin.fetchTopicMetadata({ topics: [topicName] });
			return metadata.topics[0];
		} finally {
			await admin.disconnect();
		}
	}

	@bindThis
	async listAllTopics(): Promise<string[]> {
		const admin = this.kafka.admin();
		
		try {
			await admin.connect();
			return await admin.listTopics();
		} finally {
			await admin.disconnect();
		}
	}
}