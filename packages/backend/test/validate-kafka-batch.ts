/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { KafkaProducer } from '../src/queue/kafka/KafkaProducer.js';
import { KafkaConsumer } from '../src/queue/kafka/KafkaConsumer.js';
import type { Config } from '../src/config.js';

async function validateBatching() {
	console.log('Validating Kafka batching functionality...\n');

	const config: Config = {
		queue: {
			kafka: {
				brokers: ['localhost:9092'],
				clientId: 'batch-validator',
				connectionTimeout: 30000,
				requestTimeout: 30000,
			},
		},
	} as Config;

	const producer = new KafkaProducer(config);
	const consumer = new KafkaConsumer(config);
	const testTopic = 'test.batch.validation';

	try {
		// Connect producer
		await producer.connect();
		console.log('✓ Producer connected');

		// Create consumer
		const receivedMessages: any[] = [];
		let messageCount = 0;

		await consumer.createConsumerGroup('batch-validation-group', [testTopic], async (message) => {
			receivedMessages.push(message.value);
			messageCount++;
			if (messageCount % 100 === 0) {
				console.log(`  Received ${messageCount} messages...`);
			}
		});
		console.log('✓ Consumer group created');

		// Wait for consumer to be ready
		await new Promise(resolve => setTimeout(resolve, 2000));

		// Test 1: Small batch
		console.log('\nTest 1: Sending small batch (10 messages)...');
		const smallBatch = Array.from({ length: 10 }, (_, i) => ({
			key: `small-${i}`,
			value: { id: i, type: 'small', timestamp: Date.now() },
		}));

		const start1 = Date.now();
		await producer.sendBatch(testTopic, smallBatch);
		const duration1 = Date.now() - start1;
		console.log(`✓ Small batch sent in ${duration1}ms`);

		// Test 2: Medium batch
		console.log('\nTest 2: Sending medium batch (100 messages)...');
		const mediumBatch = Array.from({ length: 100 }, (_, i) => ({
			key: `medium-${i}`,
			value: { id: i, type: 'medium', timestamp: Date.now() },
		}));

		const start2 = Date.now();
		await producer.sendBatch(testTopic, mediumBatch);
		const duration2 = Date.now() - start2;
		console.log(`✓ Medium batch sent in ${duration2}ms`);

		// Test 3: Large batch
		console.log('\nTest 3: Sending large batch (1000 messages)...');
		const largeBatch = Array.from({ length: 1000 }, (_, i) => ({
			key: `large-${i}`,
			value: { 
				id: i, 
				type: 'large', 
				timestamp: Date.now(),
				data: 'x'.repeat(1000), // 1KB payload
			},
		}));

		const start3 = Date.now();
		await producer.sendBatch(testTopic, largeBatch);
		const duration3 = Date.now() - start3;
		console.log(`✓ Large batch sent in ${duration3}ms`);

		// Test 4: Multiple partitions
		console.log('\nTest 4: Sending to specific partitions...');
		for (let partition = 0; partition < 3; partition++) {
			const partitionBatch = Array.from({ length: 50 }, (_, i) => ({
				key: `partition-${partition}-${i}`,
				value: { id: i, partition, timestamp: Date.now() },
			}));

			const startP = Date.now();
			await producer.sendBatchToPartition(testTopic, partition, partitionBatch);
			const durationP = Date.now() - startP;
			console.log(`✓ Partition ${partition} batch sent in ${durationP}ms`);
		}

		// Wait for all messages to be consumed
		console.log('\nWaiting for messages to be consumed...');
		await new Promise(resolve => setTimeout(resolve, 5000));

		// Verify results
		console.log('\n=== Results ===');
		console.log(`Total messages sent: 1260`);
		console.log(`Total messages received: ${receivedMessages.length}`);

		// Check message types
		const smallMessages = receivedMessages.filter(msg => msg.type === 'small').length;
		const mediumMessages = receivedMessages.filter(msg => msg.type === 'medium').length;
		const largeMessages = receivedMessages.filter(msg => msg.type === 'large').length;

		console.log(`\nMessage breakdown:`);
		console.log(`  Small batch: ${smallMessages}/10`);
		console.log(`  Medium batch: ${mediumMessages}/100`);
		console.log(`  Large batch: ${largeMessages}/1000`);

		// Performance summary
		console.log(`\nPerformance summary:`);
		console.log(`  Small batch (10 msgs): ${(10 / duration1 * 1000).toFixed(2)} msg/sec`);
		console.log(`  Medium batch (100 msgs): ${(100 / duration2 * 1000).toFixed(2)} msg/sec`);
		console.log(`  Large batch (1000 msgs): ${(1000 / duration3 * 1000).toFixed(2)} msg/sec`);

		if (receivedMessages.length >= 1100) {
			console.log('\n✅ Batching validation PASSED');
		} else {
			console.log('\n❌ Batching validation FAILED - not all messages received');
		}

	} catch (error) {
		console.error('❌ Batching validation failed:', error);
	} finally {
		await producer.disconnect();
		await consumer.disconnect();
	}
}

// Run the validation
validateBatching().then(() => {
	console.log('\nValidation complete');
	process.exit(0);
}).catch(error => {
	console.error('Validation error:', error);
	process.exit(1);
});