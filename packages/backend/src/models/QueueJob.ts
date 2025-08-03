/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { id } from './util/id.js';

@Entity('queue_job')
@Index(['queueName', 'status'])
@Index(['queueName', 'createdAt'])
@Index(['queueName', 'processedAt'])
export class MiQueueJob {
	@PrimaryColumn(id())
	public id: string;

	@Column('varchar', {
		length: 128,
	})
	@Index()
	public jobId: string;

	@Column('varchar', {
		length: 128,
	})
	@Index()
	public queueName: string;

	@Column('varchar', {
		length: 128,
	})
	public jobName: string;

	@Column('jsonb')
	public data: Record<string, any>;

	@Column('jsonb', {
		nullable: true,
	})
	public options: Record<string, any> | null;

	@Column('enum', {
		enum: ['pending', 'active', 'completed', 'failed', 'delayed'],
		default: 'pending',
	})
	@Index()
	public status: 'pending' | 'active' | 'completed' | 'failed' | 'delayed';

	@Column('integer', {
		default: 0,
	})
	public attemptsMade: number;

	@Column('integer', {
		nullable: true,
	})
	public maxAttempts: number | null;

	@CreateDateColumn()
	public createdAt: Date;

	@UpdateDateColumn()
	public updatedAt: Date;

	@Column('timestamp with time zone', {
		nullable: true,
	})
	public processedAt: Date | null;

	@Column('timestamp with time zone', {
		nullable: true,
	})
	public completedAt: Date | null;

	@Column('timestamp with time zone', {
		nullable: true,
	})
	public failedAt: Date | null;

	@Column('timestamp with time zone', {
		nullable: true,
	})
	@Index()
	public scheduledFor: Date | null;

	@Column('text', {
		nullable: true,
	})
	public error: string | null;

	@Column('jsonb', {
		nullable: true,
	})
	public stacktrace: string[] | null;

	@Column('jsonb', {
		nullable: true,
	})
	public result: any | null;

	@Column('integer', {
		nullable: true,
	})
	public progress: number | null;

	@Column('varchar', {
		length: 256,
		nullable: true,
	})
	public processorId: string | null;

	// Kafka-specific fields
	@Column('varchar', {
		length: 128,
		nullable: true,
	})
	public kafkaTopic: string | null;

	@Column('integer', {
		nullable: true,
	})
	public kafkaPartition: number | null;

	@Column('varchar', {
		length: 128,
		nullable: true,
	})
	public kafkaOffset: string | null;

	@Column('varchar', {
		length: 256,
		nullable: true,
	})
	public kafkaKey: string | null;
}