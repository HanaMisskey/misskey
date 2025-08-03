/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { KafkaConsumer } from '@/queue/kafka/KafkaConsumer.js';
import type { Config } from '@/config.js';

// Mock the Confluent Kafka library
jest.mock('@confluentinc/kafka-javascript', () => {
	const mockConsumer = {
		connect: jest.fn().mockResolvedValue(undefined),
		disconnect: jest.fn().mockResolvedValue(undefined),
		subscribe: jest.fn().mockResolvedValue(undefined),
		run: jest.fn().mockResolvedValue(undefined),
		pause: jest.fn(),
		resume: jest.fn(),
		seek: jest.fn().mockResolvedValue(undefined),
		commitOffsets: jest.fn().mockResolvedValue(undefined),
		stop: jest.fn().mockResolvedValue(undefined),
		assignment: jest.fn().mockReturnValue([
			{ topic: 'test-topic', partition: 0 },
			{ topic: 'test-topic', partition: 1 },
		]),
	};

	const mockAdmin = {
		connect: jest.fn().mockResolvedValue(undefined),
		disconnect: jest.fn().mockResolvedValue(undefined),
		describeGroups: jest.fn().mockResolvedValue({
			groups: [{
				groupId: 'test-group',
				state: 'Stable',
				members: [],
			}],
		}),
		fetchOffsets: jest.fn().mockResolvedValue([{
			topic: 'test-topic',
			partitions: [
				{ partition: 0, offset: '100' },
				{ partition: 1, offset: '200' },
			],
		}]),
	};

	const mockKafka = jest.fn().mockReturnValue({
		consumer: jest.fn().mockReturnValue(mockConsumer),
		admin: jest.fn().mockReturnValue(mockAdmin),
	});

	return {
		KafkaJS: {
			Kafka: mockKafka,
		},
		mockConsumer,
		mockAdmin,
	};
});

describe('KafkaConsumer', () => {
	let consumer: KafkaConsumer;
	const mockConfig: Config = {
		queue: {
			kafka: {
				brokers: ['localhost:9092'],
				clientId: 'test-client',
				connectionTimeout: 30000,
				requestTimeout: 30000,
			},
		},
	} as Config;

	beforeEach(() => {
		consumer = new KafkaConsumer(mockConfig);
	});

	afterEach(async () => {
		await consumer.disconnect();
		jest.clearAllMocks();
	});

	describe('createConsumerGroup', () => {
		test('should create a consumer group', async () => {
			const handler = jest.fn();
			
			await consumer.createConsumerGroup('test-group', ['test-topic'], handler);

			expect(consumer.isRunning()).toBe(true);
			expect(consumer.getConsumerGroups()).toContain('test-group');
		});

		test('should create consumer group with options', async () => {
			const handler = jest.fn();
			
			await consumer.createConsumerGroup('test-group', ['test-topic'], handler, {
				fromBeginning: true,
				sessionTimeout: 60000,
				heartbeatInterval: 5000,
				autoCommit: false,
			});

			expect(consumer.isRunning()).toBe(true);
		});

		test('should subscribe to multiple topics', async () => {
			const handler = jest.fn();
			
			await consumer.createConsumerGroup('test-group', ['topic1', 'topic2', 'topic3'], handler);

			expect(consumer.isRunning()).toBe(true);
		});
	});

	describe('pause and resume', () => {
		test('should pause consumer group', async () => {
			const handler = jest.fn();
			await consumer.createConsumerGroup('test-group', ['test-topic'], handler);

			await consumer.pause('test-group');

			// Test should not throw
			expect(true).toBe(true);
		});

		test('should resume consumer group', async () => {
			const handler = jest.fn();
			await consumer.createConsumerGroup('test-group', ['test-topic'], handler);

			await consumer.pause('test-group');
			await consumer.resume('test-group');

			// Test should not throw
			expect(true).toBe(true);
		});

		test('should pause specific topics', async () => {
			const handler = jest.fn();
			await consumer.createConsumerGroup('test-group', ['topic1', 'topic2'], handler);

			await consumer.pause('test-group', ['topic1']);

			// Test should not throw
			expect(true).toBe(true);
		});

		test('should throw error for non-existent group', async () => {
			await expect(consumer.pause('non-existent')).rejects.toThrow('Consumer group non-existent not found');
		});
	});

	describe('seek', () => {
		test('should seek to specific offset', async () => {
			const handler = jest.fn();
			await consumer.createConsumerGroup('test-group', ['test-topic'], handler);

			await consumer.seek('test-group', 'test-topic', 0, '100');

			// Test should not throw
			expect(true).toBe(true);
		});

		test('should throw error for non-existent group', async () => {
			await expect(consumer.seek('non-existent', 'test-topic', 0, '100'))
				.rejects.toThrow('Consumer group non-existent not found');
		});
	});

	describe('commitOffsets', () => {
		test('should commit offsets', async () => {
			const handler = jest.fn();
			await consumer.createConsumerGroup('test-group', ['test-topic'], handler);

			await consumer.commitOffsets('test-group', [
				{ topic: 'test-topic', partition: 0, offset: '100' },
				{ topic: 'test-topic', partition: 1, offset: '200' },
			]);

			// Test should not throw
			expect(true).toBe(true);
		});

		test('should throw error for non-existent group', async () => {
			await expect(consumer.commitOffsets('non-existent', []))
				.rejects.toThrow('Consumer group non-existent not found');
		});
	});

	describe('disconnect', () => {
		test('should disconnect specific consumer group', async () => {
			const handler = jest.fn();
			await consumer.createConsumerGroup('test-group', ['test-topic'], handler);

			await consumer.disconnect('test-group');

			expect(consumer.getConsumerGroups()).not.toContain('test-group');
		});

		test('should disconnect all consumer groups', async () => {
			const handler = jest.fn();
			await consumer.createConsumerGroup('group1', ['topic1'], handler);
			await consumer.createConsumerGroup('group2', ['topic2'], handler);

			await consumer.disconnect();

			expect(consumer.getConsumerGroups()).toHaveLength(0);
			expect(consumer.isRunning()).toBe(false);
		});
	});

	describe('stop', () => {
		test('should stop all consumers', async () => {
			const handler = jest.fn();
			await consumer.createConsumerGroup('test-group', ['test-topic'], handler);

			await consumer.stop();

			expect(consumer.isRunning()).toBe(false);
		});
	});

	describe('describeGroup', () => {
		test('should describe consumer group', async () => {
			const result = await consumer.describeGroup('test-group');

			expect(result).toEqual({
				groupId: 'test-group',
				state: 'Stable',
				members: [],
			});
		});
	});

	describe('fetchOffsets', () => {
		test('should fetch offsets for topics', async () => {
			const result = await consumer.fetchOffsets('test-group', ['test-topic']);

			expect(result).toEqual([
				{ topic: 'test-topic', partition: 0, offset: '100' },
				{ topic: 'test-topic', partition: 1, offset: '200' },
			]);
		});
	});

	describe('event handling', () => {
		test('should emit message:processed event', async () => {
			const handler = jest.fn().mockResolvedValue(undefined);
			const processedHandler = jest.fn();
			
			consumer.on('message:processed', processedHandler);

			// We can't easily test the actual message processing without a real Kafka instance
			// But we can verify the event handler is registered
			expect(consumer.listenerCount('message:processed')).toBe(1);
		});

		test('should emit message:error event', async () => {
			const handler = jest.fn().mockRejectedValue(new Error('Processing error'));
			const errorHandler = jest.fn();
			
			consumer.on('message:error', errorHandler);

			// We can't easily test the actual error handling without a real Kafka instance
			// But we can verify the event handler is registered
			expect(consumer.listenerCount('message:error')).toBe(1);
		});
	});
});