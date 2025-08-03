/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Module, OnApplicationShutdown, Inject } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import type { QueueAdapter } from '@/queue/adapters/QueueAdapter.js';
import { BullMQAdapter } from '@/queue/adapters/BullMQAdapter.js';
import { KafkaAdapter } from '@/queue/adapters/KafkaAdapter.js';
import { JobTracker } from '@/queue/kafka/JobTracker.js';
import { baseQueueOptions } from '@/queue/const.js';
import type { Provider } from '@nestjs/common';

const $queueAdapter: Provider = {
	provide: 'queue:adapter',
	useFactory: (config: Config, jobTracker: JobTracker) => {
		switch (config.queue.adapter) {
			case 'kafka':
				return new KafkaAdapter(config, jobTracker);
			case 'bullmq':
			default:
				return new BullMQAdapter(config.redisForJobQueue);
		}
	},
	inject: [DI.config, DI.queueJobsRepository],
};

@Module({
	imports: [],
	providers: [
		$queueAdapter,
	],
	exports: [
		$queueAdapter,
	],
})
export class QueueModuleAdapter implements OnApplicationShutdown {
	constructor(
		@Inject('queue:adapter') public queueAdapter: QueueAdapter,
	) {}

	public async dispose(): Promise<void> {
		await this.queueAdapter.close();
	}

	async onApplicationShutdown(signal: string): Promise<void> {
		await this.dispose();
	}
}