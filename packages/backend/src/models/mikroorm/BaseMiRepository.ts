// BaseMiRepository.ts
import { EntityRepository, EntityManager, EntityName } from '@mikro-orm/core';

export interface MiRepository<T> {
  createTableColumnNames(): string[];
  insertOne(entity: Partial<T>, findOptions?: { relations?: string[] }): Promise<T>;
  selectAliasColumnNames(queryBuilder: EntityManager['qb'], builder: EntityManager['qb']): void;
}

export class BaseMiRepository<T> extends EntityRepository<T> implements MiRepository<T> {
	constructor(entity: EntityName<T>, private readonly em: EntityManager) {
		super(em, entity);
	}

	createTableColumnNames(): string[] {
		const metadata = this.em.getMetadata().get(this.entityName);
		return metadata.properties
			.filter(prop => prop.persist && !prop.virtual)
			.map(prop => prop.name);
	}

	async insertOne(entity: Partial<T>, findOptions?: { relations?: string[] }): Promise<T> {
		const newEntity = this.em.create(this.entityName, entity);
		await this.em.persistAndFlush(newEntity);

		if (findOptions?.relations) {
			await this.em.populate(newEntity, findOptions.relations);
		}
		return newEntity;
	}

	selectAliasColumnNames(queryBuilder: EntityManager['qb'], builder: EntityManager['qb']): void {
		const alias = builder.getAlias();
		this.createTableColumnNames().forEach(columnName => {
			builder.addSelect(`${alias}.${columnName}`, `${alias}_${columnName}`);
		});
	}
}
