/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { KafkaProducer } from '@/queue/kafka/KafkaProducer.js';
import { KafkaConsumer } from '@/queue/kafka/KafkaConsumer.js';
import type { Config } from '@/config.js';

describe('Kafka Integration Tests', () => {
	let producer: KafkaProducer;
	let consumer: KafkaConsumer;
	const testTopic = 'test.integration';
	
	const config: Config = {
		queue: {
			kafka: {
				brokers: ['localhost:9092'],
				clientId: 'integration-test',
				connectionTimeout: 30000,
				requestTimeout: 30000,
			},
		},
	} as Config;

	beforeAll(async () => {
		producer = new KafkaProducer(config);
		consumer = new KafkaConsumer(config);
		
		// Ensure Kafka is running
		try {
			await producer.connect();
			await producer.disconnect();
		} catch (error) {
			console.error('Kafka is not available. Make sure Docker services are running.');
			throw error;
		}
	}, 30000);

	afterAll(async () => {
		await producer.disconnect();
		await consumer.disconnect();
	});

	test('should send and receive a single message', async () => {
		await producer.connect();

		const testMessage = {
			id: 'test-1',
			data: 'Hello Kafka',
			timestamp: Date.now(),
		};

		// Set up consumer
		const receivedMessages: any[] = [];
		await consumer.createConsumerGroup('test-group-1', [testTopic], async (message) => {
			receivedMessages.push(message.value);
		});

		// Wait for consumer to be ready
		await new Promise(resolve => setTimeout(resolve, 2000));

		// Send message
		await producer.send(testTopic, {
			key: 'test-key',
			value: testMessage,
		});

		// Wait for message to be received
		await new Promise(resolve => setTimeout(resolve, 3000));

		expect(receivedMessages).toHaveLength(1);
		expect(receivedMessages[0]).toEqual(testMessage);
	}, 30000);

	test('should send and receive batch messages', async () => {
		await producer.connect();

		const testMessages = Array.from({ length: 10 }, (_, i) => ({
			key: `batch-key-${i}`,
			value: {
				id: `batch-${i}`,
				data: `Batch message ${i}`,
				timestamp: Date.now(),
			},
		}));

		// Set up consumer
		const receivedMessages: any[] = [];
		await consumer.createConsumerGroup('test-group-2', [testTopic], async (message) => {
			receivedMessages.push(message.value);
		});

		// Wait for consumer to be ready
		await new Promise(resolve => setTimeout(resolve, 2000));

		// Send batch
		await producer.sendBatch(testTopic, testMessages);

		// Wait for messages to be received
		await new Promise(resolve => setTimeout(resolve, 5000));

		expect(receivedMessages.length).toBeGreaterThanOrEqual(10);
		
		// Check if all batch messages were received
		for (let i = 0; i < 10; i++) {
			const found = receivedMessages.find(msg => msg.id === `batch-${i}`);
			expect(found).toBeDefined();
		}
	}, 30000);

	test('should handle consumer pause and resume', async () => {
		await producer.connect();

		const groupId = 'test-group-3';
		const receivedMessages: any[] = [];
		
		await consumer.createConsumerGroup(groupId, [testTopic], async (message) => {
			receivedMessages.push(message.value);
		});

		// Wait for consumer to be ready
		await new Promise(resolve => setTimeout(resolve, 2000));

		// Send first message
		await producer.send(testTopic, {
			key: 'pause-test-1',
			value: { id: 'msg-1', data: 'Before pause' },
		});

		// Wait and verify receipt
		await new Promise(resolve => setTimeout(resolve, 2000));
		expect(receivedMessages).toHaveLength(1);

		// Pause consumer
		await consumer.pause(groupId);

		// Send message while paused
		await producer.send(testTopic, {
			key: 'pause-test-2',
			value: { id: 'msg-2', data: 'During pause' },
		});

		// Wait - message should not be received
		await new Promise(resolve => setTimeout(resolve, 2000));
		expect(receivedMessages).toHaveLength(1);

		// Resume consumer
		await consumer.resume(groupId);

		// Wait for paused message to be delivered
		await new Promise(resolve => setTimeout(resolve, 3000));
		expect(receivedMessages).toHaveLength(2);
		expect(receivedMessages[1].id).toBe('msg-2');
	}, 30000);

	test('should handle messages with headers', async () => {
		await producer.connect();

		const testMessage = {
			id: 'header-test',
			data: 'Message with headers',
		};

		const headers = {
			'x-custom-header': 'custom-value',
			'x-request-id': 'req-123',
		};

		// Set up consumer
		let receivedMessage: any = null;
		await consumer.createConsumerGroup('test-group-4', [testTopic], async (message) => {
			receivedMessage = message;
		});

		// Wait for consumer to be ready
		await new Promise(resolve => setTimeout(resolve, 2000));

		// Send message with headers
		await producer.send(testTopic, {
			key: 'header-key',
			value: testMessage,
			headers,
		});

		// Wait for message to be received
		await new Promise(resolve => setTimeout(resolve, 3000));

		expect(receivedMessage).toBeTruthy();
		expect(receivedMessage.value).toEqual(testMessage);
		expect(receivedMessage.headers['x-custom-header']).toBe('custom-value');
		expect(receivedMessage.headers['x-request-id']).toBe('req-123');
	}, 30000);

	test('should handle partition-specific sending', async () => {
		await producer.connect();

		const partition = 0;
		const testMessage = {
			id: 'partition-test',
			data: 'Partition-specific message',
		};

		// Set up consumer
		let receivedMessage: any = null;
		await consumer.createConsumerGroup('test-group-5', [testTopic], async (message) => {
			receivedMessage = message;
		});

		// Wait for consumer to be ready
		await new Promise(resolve => setTimeout(resolve, 2000));

		// Send to specific partition
		await producer.sendToPartition(testTopic, partition, {
			key: 'partition-key',
			value: testMessage,
		});

		// Wait for message to be received
		await new Promise(resolve => setTimeout(resolve, 3000));

		expect(receivedMessage).toBeTruthy();
		expect(receivedMessage.value).toEqual(testMessage);
		expect(receivedMessage.partition).toBe(partition);
	}, 30000);
});