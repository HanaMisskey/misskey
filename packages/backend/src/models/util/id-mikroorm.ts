import { Type } from '@mikro-orm/core';

export class IdType extends Type<string, string> {
	convertToDatabaseValue(value: string): string {
		return value;
	}

	convertToJSValue(value: string): string {
		return value;
	}

	getColumnType(): string {
		return 'varchar(32)'; // カラムタイプを指定
	}
}

// id関数はIdTypeのインスタンスを返すように変更
export const id = () => new IdType();
