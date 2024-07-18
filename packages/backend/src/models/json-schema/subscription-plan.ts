export const packedSubscriptionPlanSchema = {
	type: 'object',
	properties: {
		id: {
			type: 'string',
			optional: false, nullable: false,
			format: 'id',
			example: 'xxxxxxxxxx',
		},
		name: {
			type: 'string',
			optional: false, nullable: false,
			example: 'New Plan',
		},
		price: {
			type: 'integer',
			optional: false, nullable: false,
			example: 1000,
		},
		currency: {
			type: 'string',
			optional: false, nullable: false,
			example: 'usd',
		},
		description: {
			type: 'string',
			optional: false, nullable: true,
			example: 'New Plan',
		},
		stripePriceId: {
			type: 'string',
			optional: false, nullable: false,
			example: 'price_xxxxxxxxxx',
		},
		roleId: {
			type: 'string',
			optional: false, nullable: false,
			format: 'id',
			example: 'xxxxxxxxxx',
		},
		role: {
			type: 'object',
			ref: 'RoleLite',
			optional: false, nullable: false,
		},
		isArchived: {
			type: 'boolean',
			optional: false, nullable: false,
			example: false,
		},
	},
} as const;
