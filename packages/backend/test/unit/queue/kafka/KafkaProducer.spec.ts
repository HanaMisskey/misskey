/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { KafkaProducer } from '@/queue/kafka/KafkaProducer.js';
import type { Config } from '@/config.js';

// Mock the Confluent Kafka library
jest.mock('@confluentinc/kafka-javascript', () => {
	const mockProducer = {
		connect: jest.fn().mockResolvedValue(undefined),
		disconnect: jest.fn().mockResolvedValue(undefined),
		send: jest.fn().mockResolvedValue([{ topicName: 'test-topic', partition: 0, errorCode: 0 }]),
		sendBatch: jest.fn().mockResolvedValue([{ topicName: 'test-topic', partition: 0, errorCode: 0 }]),
		events: {
			on: jest.fn(),
		},
	};

	const mockKafka = jest.fn().mockReturnValue({
		producer: jest.fn().mockReturnValue(mockProducer),
	});

	return {
		KafkaJS: {
			Kafka: mockKafka,
			CompressionTypes: {
				None: 0,
				GZIP: 1,
				Snappy: 2,
				LZ4: 3,
				ZSTD: 4,
			},
		},
	};
});

describe('KafkaProducer', () => {
	let producer: KafkaProducer;
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
		producer = new KafkaProducer(mockConfig);
	});

	afterEach(async () => {
		await producer.disconnect();
		jest.clearAllMocks();
	});

	describe('connect', () => {
		test('should connect successfully', async () => {
			await expect(producer.connect()).resolves.not.toThrow();
			expect(producer.isConnected()).toBe(true);
		});

		test('should not connect twice', async () => {
			await producer.connect();
			await producer.connect();
			expect(producer.isConnected()).toBe(true);
		});
	});

	describe('send', () => {
		test('should send a single message', async () => {
			await producer.connect();
			
			const result = await producer.send('test-topic', {
				key: 'test-key',
				value: { data: 'test' },
			});

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				topicName: 'test-topic',
				partition: 0,
				errorCode: 0,
			});
		});

		test('should send a message without key', async () => {
			await producer.connect();
			
			const result = await producer.send('test-topic', {
				value: { data: 'test' },
			});

			expect(result).toHaveLength(1);
		});

		test('should send a message with headers', async () => {
			await producer.connect();
			
			const result = await producer.send('test-topic', {
				key: 'test-key',
				value: { data: 'test' },
				headers: {
					'x-custom-header': 'value',
				},
			});

			expect(result).toHaveLength(1);
		});
	});

	describe('sendBatch', () => {
		test('should send multiple messages', async () => {
			await producer.connect();
			
			const messages = [
				{ key: 'key1', value: { data: 'test1' } },
				{ key: 'key2', value: { data: 'test2' } },
			];

			const result = await producer.sendBatch('test-topic', messages);

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				topicName: 'test-topic',
				partition: 0,
				errorCode: 0,
			});
		});

		test('should send batch with mixed message types', async () => {
			await producer.connect();
			
			const messages = [
				{ value: { data: 'test1' } },
				{ key: 'key2', value: { data: 'test2' }, headers: { type: 'test' } },
			];

			const result = await producer.sendBatch('test-topic', messages);

			expect(result).toHaveLength(1);
		});
	});

	describe('sendToPartition', () => {
		test('should send to specific partition', async () => {
			await producer.connect();
			
			const result = await producer.sendToPartition('test-topic', 1, {
				key: 'test-key',
				value: { data: 'test' },
			});

			expect(result).toHaveLength(1);
		});
	});

	describe('sendBatchToPartition', () => {
		test('should send batch to specific partition', async () => {
			await producer.connect();
			
			const messages = [
				{ key: 'key1', value: { data: 'test1' } },
				{ key: 'key2', value: { data: 'test2' } },
			];

			const result = await producer.sendBatchToPartition('test-topic', 2, messages);

			expect(result).toHaveLength(1);
		});
	});

	describe('disconnect', () => {
		test('should disconnect successfully', async () => {
			await producer.connect();
			await producer.disconnect();
			expect(producer.isConnected()).toBe(false);
		});

		test('should handle disconnect when not connected', async () => {
			await expect(producer.disconnect()).resolves.not.toThrow();
		});
	});

	describe('error handling', () => {
		test('should emit error events', async () => {
			const errorHandler = jest.fn();
			producer.on('error', errorHandler);

			// Simulate an error event
			producer.emit('error', new Error('Test error'));

			expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));
		});
	});
});