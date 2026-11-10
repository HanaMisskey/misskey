export type HanamiDeviceContext = {
	deviceClass: 'mobile' | 'tablet' | 'desktop' | 'unknown';
	viewportClass: 'compact' | 'medium' | 'wide' | 'unknown';
	primaryPointer: 'coarse' | 'fine' | 'none' | 'unknown';
};

export const hanamiDeviceContextSchema = {
	type: 'object', additionalProperties: false,
	properties: {
		deviceClass: { type: 'string', enum: ['mobile', 'tablet', 'desktop', 'unknown'] },
		viewportClass: { type: 'string', enum: ['compact', 'medium', 'wide', 'unknown'] },
		primaryPointer: { type: 'string', enum: ['coarse', 'fine', 'none', 'unknown'] },
	}, required: ['deviceClass', 'viewportClass', 'primaryPointer'],
} as const;

export function validHanamiDeviceContext(value: unknown): value is HanamiDeviceContext {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
	const record = value as Record<string, unknown>;
	return Object.keys(record).every(key => Object.hasOwn(hanamiDeviceContextSchema.properties, key))
		&& Object.entries(hanamiDeviceContextSchema.properties).every(([key, schema]) => typeof record[key] === 'string' && (schema.enum as readonly string[]).includes(record[key]));
}
