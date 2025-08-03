/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect } from '@jest/globals';
import { ConfluentCompat } from '@/queue/kafka/compat/ConfluentCompat.js';

describe('ConfluentCompat', () => {
	describe('adaptProducerConfig', () => {
		test('should convert basic producer config', () => {
			const kafkaJsConfig = {
				brokers: ['localhost:9092', 'localhost:9093'],
				clientId: 'test-producer',
				connectionTimeout: 5000,
				requestTimeout: 10000,
			};

			const result = ConfluentCompat.adaptProducerConfig(kafkaJsConfig);

			expect(result['bootstrap.servers']).toBe('localhost:9092,localhost:9093');
			expect(result['client.id']).toBe('test-producer');
			expect(result['socket.connection.setup.timeout.ms']).toBe(5000);
			expect(result['request.timeout.ms']).toBe(10000);
		});

		test('should handle SSL configuration', () => {
			const kafkaJsConfig = {
				brokers: ['localhost:9092'],
				ssl: {
					ca: 'ca-cert',
					cert: 'client-cert',
					key: 'client-key',
				},
			};

			const result = ConfluentCompat.adaptProducerConfig(kafkaJsConfig);

			expect(result['security.protocol']).toBe('SSL');
			expect(result['ssl.ca.location']).toBe('ca-cert');
			expect(result['ssl.certificate.location']).toBe('client-cert');
			expect(result['ssl.key.location']).toBe('client-key');
		});

		test('should handle SASL configuration', () => {
			const kafkaJsConfig = {
				brokers: ['localhost:9092'],
				sasl: {
					mechanism: 'scram-sha-512',
					username: 'user',
					password: 'pass',
				},
			};

			const result = ConfluentCompat.adaptProducerConfig(kafkaJsConfig);

			expect(result['security.protocol']).toBe('SASL_PLAINTEXT');
			expect(result['sasl.mechanisms']).toBe('SCRAM-SHA-512');
			expect(result['sasl.username']).toBe('user');
			expect(result['sasl.password']).toBe('pass');
		});

		test('should handle compression settings', () => {
			const kafkaJsConfig = {
				brokers: ['localhost:9092'],
				compression: 'gzip',
			};

			const result = ConfluentCompat.adaptProducerConfig(kafkaJsConfig);

			expect(result['compression.type']).toBe('gzip');
		});
	});

	describe('adaptConsumerConfig', () => {
		test('should convert basic consumer config', () => {
			const kafkaJsConfig = {
				brokers: ['localhost:9092'],
				groupId: 'test-group',
				clientId: 'test-consumer',
				sessionTimeout: 30000,
				heartbeatInterval: 3000,
			};

			const result = ConfluentCompat.adaptConsumerConfig(kafkaJsConfig);

			expect(result['bootstrap.servers']).toBe('localhost:9092');
			expect(result['group.id']).toBe('test-group');
			expect(result['client.id']).toBe('test-consumer');
			expect(result['session.timeout.ms']).toBe(30000);
			expect(result['heartbeat.interval.ms']).toBe(3000);
		});

		test('should handle consumer-specific settings', () => {
			const kafkaJsConfig = {
				brokers: ['localhost:9092'],
				groupId: 'test-group',
				maxBytesPerPartition: 1048576,
				minBytes: 100,
				maxBytes: 10485760,
				maxWaitTimeInMs: 5000,
			};

			const result = ConfluentCompat.adaptConsumerConfig(kafkaJsConfig);

			expect(result['max.partition.fetch.bytes']).toBe(1048576);
			expect(result['fetch.min.bytes']).toBe(100);
			expect(result['fetch.message.max.bytes']).toBe(10485760);
			expect(result['fetch.max.wait.ms']).toBe(5000);
		});

		test('should handle auto-commit settings', () => {
			const kafkaJsConfig = {
				brokers: ['localhost:9092'],
				groupId: 'test-group',
				autoCommit: false,
				autoCommitInterval: 10000,
			};

			const result = ConfluentCompat.adaptConsumerConfig(kafkaJsConfig);

			expect(result['enable.auto.commit']).toBe(false);
			expect(result['auto.commit.interval.ms']).toBe(10000);
		});
	});

	describe('getOptimizedSettings', () => {
		test('should return producer optimized settings', () => {
			const settings = ConfluentCompat.getOptimizedSettings('producer');

			expect(settings['linger.ms']).toBe(10);
			expect(settings['compression.type']).toBe('gzip');
			expect(settings['batch.size']).toBe(16384);
			expect(settings['buffer.memory']).toBe(33554432);
			expect(settings['max.in.flight.requests.per.connection']).toBe(5);
		});

		test('should return consumer optimized settings', () => {
			const settings = ConfluentCompat.getOptimizedSettings('consumer');

			expect(settings['fetch.min.bytes']).toBe(1);
			expect(settings['fetch.max.wait.ms']).toBe(500);
			expect(settings['max.partition.fetch.bytes']).toBe(1048576);
			expect(settings['enable.auto.commit']).toBe(true);
			expect(settings['auto.commit.interval.ms']).toBe(5000);
		});

		test('should return consumer settings for unknown type', () => {
			const settings = ConfluentCompat.getOptimizedSettings('unknown' as any);

			// The function returns consumer settings as default
			expect(settings['fetch.min.bytes']).toBeDefined();
			expect(settings['enable.auto.commit']).toBeDefined();
		});
	});
});