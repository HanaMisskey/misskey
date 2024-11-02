import { Entity, PrimaryKey, Property, Index } from '@mikro-orm/core';
import { id } from '@/models/util/id-mikroorm.js';

@Entity({ tableName: 'ad' })
export class MiAd {
	@PrimaryKey({ type: id() })
	public id!: string;

	@Index()
	@Property({ type: 'Date', columnType: 'timestamp with time zone', comment: 'The expired date of the Ad.' })
	public expiresAt!: Date;

	@Index()
	@Property({ type: 'Date', columnType: 'timestamp with time zone', comment: 'The start date of the Ad.', defaultRaw: 'now()' })
	public startsAt!: Date;

	@Property({ type: 'string', length: 32, nullable: false })
	public place!: string;

	// 今は使われていないが将来的に活用される可能性はある
	@Property({ type: 'string', length: 32, nullable: false })
	public priority!: string;

	@Property({ type: 'number', default: 1, nullable: false })
	public ratio = 1;

	@Property({ type: 'string', length: 1024, nullable: false })
	public url!: string;

	@Property({ type: 'string', length: 1024, nullable: false })
	public imageUrl!: string;

	@Property({ type: 'string', length: 8192, nullable: false })
	public memo!: string;

	@Property({ type: 'number', default: 0, nullable: false })
	public dayOfWeek = 0;

	constructor(data: Partial<MiAd>) {
		Object.assign(this, data);
	}
}
