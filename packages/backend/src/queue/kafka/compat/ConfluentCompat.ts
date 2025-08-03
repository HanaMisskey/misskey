/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Compatibility layer for migrating from KafkaJS to Confluent Kafka JavaScript
 * This helps map configuration and API differences between the two libraries
 */
export class ConfluentCompat {
	/**
	 * Convert KafkaJS producer configuration to Confluent format
	 */
	static adaptProducerConfig(config: any): any {
		const confluentConfig: any = {
			'client.id': config.clientId,
			'bootstrap.servers': Array.isArray(config.brokers) ? config.brokers.join(',') : config.brokers,
		};

		// SSL configuration
		if (config.ssl) {
			confluentConfig['security.protocol'] = 'SSL';
			if (typeof config.ssl === 'object') {
				if (config.ssl.ca) confluentConfig['ssl.ca.location'] = config.ssl.ca;
				if (config.ssl.cert) confluentConfig['ssl.certificate.location'] = config.ssl.cert;
				if (config.ssl.key) confluentConfig['ssl.key.location'] = config.ssl.key;
			}
		}

		// SASL configuration
		if (config.sasl) {
			confluentConfig['security.protocol'] = config.ssl ? 'SASL_SSL' : 'SASL_PLAINTEXT';
			confluentConfig['sasl.mechanisms'] = config.sasl.mechanism.toUpperCase();
			confluentConfig['sasl.username'] = config.sasl.username;
			confluentConfig['sasl.password'] = config.sasl.password;
		}

		// Connection settings
		if (config.connectionTimeout) {
			confluentConfig['socket.connection.setup.timeout.ms'] = config.connectionTimeout;
		}
		if (config.requestTimeout) {
			confluentConfig['request.timeout.ms'] = config.requestTimeout;
		}

		// Retry settings
		if (config.retry) {
			if (config.retry.retries !== undefined) {
				confluentConfig['message.send.max.retries'] = config.retry.retries;
			}
			if (config.retry.initialRetryTime !== undefined) {
				confluentConfig['retry.backoff.ms'] = config.retry.initialRetryTime;
			}
			if (config.retry.maxRetryTime !== undefined) {
				confluentConfig['retry.backoff.max.ms'] = config.retry.maxRetryTime;
			}
		}

		// Producer-specific settings
		if (config.allowAutoTopicCreation !== undefined) {
			confluentConfig['allow.auto.create.topics'] = config.allowAutoTopicCreation;
		}
		if (config.transactionTimeout !== undefined) {
			confluentConfig['transaction.timeout.ms'] = config.transactionTimeout;
		}
		if (config.idempotent !== undefined) {
			confluentConfig['enable.idempotence'] = config.idempotent;
		}
		if (config.compression) {
			confluentConfig['compression.type'] = config.compression.toLowerCase();
		}
		if (config.maxInFlightRequests !== undefined) {
			confluentConfig['max.in.flight.requests.per.connection'] = config.maxInFlightRequests;
		}

		// Batching settings
		confluentConfig['linger.ms'] = 10; // Default batching delay
		confluentConfig['batch.size'] = 16384; // Default batch size
		confluentConfig['buffer.memory'] = 33554432; // 32MB buffer

		return confluentConfig;
	}

	/**
	 * Convert KafkaJS consumer configuration to Confluent format
	 */
	static adaptConsumerConfig(config: any): any {
		const confluentConfig: any = {
			'group.id': config.groupId,
			'client.id': config.clientId || 'misskey-consumer',
		};

		// Basic consumer settings
		if (config.sessionTimeout !== undefined) {
			confluentConfig['session.timeout.ms'] = config.sessionTimeout;
		}
		if (config.heartbeatInterval !== undefined) {
			confluentConfig['heartbeat.interval.ms'] = config.heartbeatInterval;
		}
		if (config.maxBytesPerPartition !== undefined) {
			confluentConfig['max.partition.fetch.bytes'] = config.maxBytesPerPartition;
		}
		if (config.minBytes !== undefined) {
			confluentConfig['fetch.min.bytes'] = config.minBytes;
		}
		if (config.maxBytes !== undefined) {
			confluentConfig['fetch.message.max.bytes'] = config.maxBytes;
		}
		if (config.maxWaitTimeInMs !== undefined) {
			confluentConfig['fetch.max.wait.ms'] = config.maxWaitTimeInMs;
		}

		// Auto commit settings
		confluentConfig['enable.auto.commit'] = config.autoCommit ?? true;
		if (config.autoCommitInterval !== undefined) {
			confluentConfig['auto.commit.interval.ms'] = config.autoCommitInterval;
		}

		// Retry settings
		if (config.retry) {
			// Confluent consumer retry is handled differently
			// These settings control internal retries
			if (config.retry.retries !== undefined) {
				confluentConfig['api.version.request.timeout.ms'] = 10000;
			}
		}

		// Security settings (inherit from base config)
		const baseConfig = this.adaptProducerConfig(config);
		const securityKeys = [
			'security.protocol',
			'sasl.mechanisms',
			'sasl.username',
			'sasl.password',
			'ssl.ca.location',
			'ssl.certificate.location',
			'ssl.key.location',
		];
		
		for (const key of securityKeys) {
			if (baseConfig[key]) {
				confluentConfig[key] = baseConfig[key];
			}
		}

		// Connection settings
		if (baseConfig['bootstrap.servers']) {
			confluentConfig['bootstrap.servers'] = baseConfig['bootstrap.servers'];
		}

		return confluentConfig;
	}

	/**
	 * Convert KafkaJS message format to Confluent format
	 */
	static adaptMessage(message: any): any {
		return {
			key: message.key,
			value: message.value,
			headers: message.headers,
			timestamp: message.timestamp,
			partition: message.partition,
		};
	}

	/**
	 * Convert Confluent message format to KafkaJS format
	 */
	static adaptConfluentMessage(message: any): any {
		return {
			key: message.key,
			value: message.value,
			headers: message.headers || {},
			timestamp: message.timestamp || Date.now().toString(),
			offset: message.offset,
			partition: message.partition,
		};
	}

	/**
	 * Check if a configuration uses the new Confluent format
	 */
	static isConfluentConfig(config: any): boolean {
		// Check for Confluent-style configuration keys
		return config['bootstrap.servers'] !== undefined ||
			config['client.id'] !== undefined ||
			config['group.id'] !== undefined;
	}

	/**
	 * Get optimal Confluent-specific settings for performance
	 */
	static getOptimizedSettings(type: 'producer' | 'consumer'): any {
		if (type === 'producer') {
			return {
				// Performance optimizations
				'linger.ms': 10,
				'compression.type': 'gzip',
				'batch.size': 16384,
				'buffer.memory': 33554432,
				'queue.buffering.max.messages': 100000,
				'queue.buffering.max.kbytes': 1048576,
				
				// Reliability settings
				'enable.idempotence': true,
				'acks': 'all',
				'max.in.flight.requests.per.connection': 5,
				'retries': 2147483647,
				
				// Timeout settings
				'request.timeout.ms': 30000,
				'message.timeout.ms': 300000,
			};
		} else {
			return {
				// Performance optimizations
				'fetch.min.bytes': 1,
				'fetch.max.wait.ms': 500,
				'max.partition.fetch.bytes': 1048576,
				
				// Consumer group settings
				'enable.auto.commit': true,
				'auto.commit.interval.ms': 5000,
				'auto.offset.reset': 'latest',
				
				// Session settings
				'session.timeout.ms': 30000,
				'heartbeat.interval.ms': 3000,
			};
		}
	}
}