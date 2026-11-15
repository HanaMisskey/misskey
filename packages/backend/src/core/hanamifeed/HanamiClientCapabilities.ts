export type HanamiClientCapabilities = { nativeShare: boolean };

export const hanamiClientCapabilitiesSchema = {
	type: 'object', additionalProperties: false,
	properties: { nativeShare: { type: 'boolean' } },
	required: ['nativeShare'],
} as const;

export function validHanamiClientCapabilities(value: unknown): value is HanamiClientCapabilities {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		&& Object.keys(value).length === 1 && 'nativeShare' in value && typeof value.nativeShare === 'boolean';
}
