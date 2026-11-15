import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('hanami_read_barrier')
export class MiHanamiReadBarrier {
	@PrimaryColumn('varchar', { length: 32, primaryKeyConstraintName: 'PK_hanami_read_barrier' })
	public nonce: string;

	@Column('varchar', { length: 128 })
	public sourceId: string;

	@Column('integer')
	public generation: number;

	@Column('varchar', { length: 32 })
	public viewerId: string;

	@Index('IDX_hanami_read_barrier_created_at')
	@Column('timestamp with time zone')
	public createdAt: Date;
}
