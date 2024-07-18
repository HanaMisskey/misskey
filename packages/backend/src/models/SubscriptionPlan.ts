import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { MiRole } from '@/models/Role.js';
import { id } from './util/id.js';

@Entity('subscription_plan')
export class MiSubscriptionPlan {
	@PrimaryColumn(id())
	public id: string;

	@Column('varchar', {
		length: 128,
	})
	public name: string;

	@Column('integer')
	public price: number;

	@Column('varchar', {
		length: 128,
	})
	public currency: string;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public description: string | null;

	@Column('varchar', {
		length: 128,
	})
	public stripePriceId: string;

	@Index({ unique: true })
	@Column(id())
	public roleId: MiRole['id'];

	@ManyToOne(type => MiRole, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public role: MiRole | null;

	@Column('boolean', {
		default: false,
	})
	public isArchived: boolean;
}
