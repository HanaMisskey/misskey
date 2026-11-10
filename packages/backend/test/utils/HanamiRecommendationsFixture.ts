export type TestRow = Record<string, unknown>;

/** Repository double for TypeORM's data selection only. It deliberately contains no visibility, time-policy, recommendation or signature decisions. */
export function matchesWhere(row: TestRow, where: unknown): boolean {
	if (where == null) return true;
	if (Array.isArray(where)) return where.some(condition => matchesWhere(row, condition));
	if (typeof where !== 'object') throw new Error('Unexpected repository condition');
	return Object.entries(where).every(([key, expected]) => {
		const actual = row[key];
		if (expected != null && typeof expected === 'object' && 'type' in expected && 'value' in expected) {
			const operator = expected as { type: string; value: unknown };
			switch (operator.type) {
				case 'in': return (operator.value as unknown[]).includes(actual);
				case 'isNull': return actual == null;
				case 'not': return !matchesWhere(row, { [key]: operator.value });
				case 'moreThan': return Number(actual) > Number(operator.value);
				case 'lessThan': return Number(actual) < Number(operator.value);
				case 'moreThanOrEqual': return Number(actual) >= Number(operator.value);
				case 'lessThanOrEqual': return Number(actual) <= Number(operator.value);
				default: throw new Error(`Unsupported repository operator ${operator.type}`);
			}
		}
		return actual === expected;
	});
}

export function repository(readRows: () => TestRow[]) {
	const select = (where: unknown) => readRows().filter(row => matchesWhere(row, where)).map(row => ({ ...row }));
	return {
		find: async (options?: { where?: unknown }) => select(options?.where),
		findBy: async (where: unknown) => select(where),
		findOne: async (options?: { where?: unknown }) => select(options?.where).at(0) ?? null,
		findOneBy: async (where: unknown) => select(where).at(0) ?? null,
		findOneOrFail: async (options?: { where?: unknown }) => {
			const row = select(options?.where).at(0);
			if (!row) throw new Error('Missing fixture row');
			return row;
		},
		findOneByOrFail: async (where: unknown) => {
			const row = select(where).at(0);
			if (!row) throw new Error('Missing fixture row');
			return row;
		},
	};
}
