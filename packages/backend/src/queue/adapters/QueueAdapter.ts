/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export interface JobOptions {
	delay?: number;
	attempts?: number;
	backoff?: {
		type: 'custom' | 'exponential' | 'fixed';
		delay?: number;
	};
	removeOnComplete?: boolean | {
		age?: number;
		count?: number;
	};
	removeOnFail?: boolean | {
		age?: number;
		count?: number;
	};
	repeat?: {
		pattern?: string;
		every?: number;
		limit?: number;
		startDate?: Date | string | number;
		endDate?: Date | string | number;
		tz?: string;
	};
	priority?: number;
}

export interface Job<T = any> {
	id: string;
	name: string;
	data: T;
	opts: JobOptions;
	timestamp: number;
	attemptsMade: number;
	processedOn?: number;
	finishedOn?: number;
	progress: number | Record<string, any>;
	returnvalue?: any;
	failedReason?: string;
	stacktrace?: string[];
}

export interface QueueStats {
	waiting: number;
	active: number;
	completed: number;
	failed: number;
	delayed: number;
	paused: number;
}

export interface QueueMetrics {
	completed: {
		count: number;
		data: Array<{ timestamp: number; value: number }>;
	};
	failed: {
		count: number;
		data: Array<{ timestamp: number; value: number }>;
	};
}

export type JobType = 'completed' | 'waiting' | 'active' | 'delayed' | 'failed' | 'paused' | 'prioritized';

export interface QueueAdapter {
	// Core job operations
	createJob<T = any>(queueName: string, jobName: string, data: T, opts?: JobOptions): Promise<Job<T>>;
	createBulkJobs<T = any>(queueName: string, jobs: Array<{ name: string; data: T; opts?: JobOptions }>): Promise<Job<T>[]>;
	
	// Job processing
	processJobs<T = any>(queueName: string, concurrency: number | string, processor: (job: Job<T>) => Promise<any>): void;
	
	// Job retrieval
	getJob<T = any>(queueName: string, jobId: string): Promise<Job<T> | null>;
	getJobs<T = any>(queueName: string, types: JobType[], start?: number, end?: number): Promise<Job<T>[]>;
	getDelayedJobs<T = any>(queueName: string, start?: number, end?: number): Promise<Job<T>[]>;
	
	// Job management
	removeJob(queueName: string, jobId: string): Promise<void>;
	retryJob(queueName: string, jobId: string): Promise<void>;
	promoteJobs(queueName: string): Promise<void>;
	
	// Queue management
	clearQueue(queueName: string, state?: JobType | '*'): Promise<void>;
	pauseQueue(queueName: string): Promise<void>;
	resumeQueue(queueName: string): Promise<void>;
	
	// Queue information
	getQueueStats(queueName: string): Promise<QueueStats>;
	getQueueMetrics(queueName: string, type: 'completed' | 'failed', start?: number, end?: number): Promise<QueueMetrics>;
	isQueuePaused(queueName: string): Promise<boolean>;
	
	// Lifecycle
	initialize(): Promise<void>;
	close(): Promise<void>;
	
	// Event handling
	on(queueName: string, event: string, handler: (...args: any[]) => void): void;
	off(queueName: string, event: string, handler: (...args: any[]) => void): void;
}