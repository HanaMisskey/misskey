import { ApiError } from '@/server/api/error.js';
import { HanamiPlatformError } from './HanamiPlatformClient.js';

export const hanamiApiErrors = {
	unavailable: { message: 'Recommendations are unavailable.', code: 'UNAVAILABLE', id: 'fb3ea97c-ef41-4d07-a95b-1748f1e2a49d', kind: 'server', httpStatusCode: 503 },
	refreshRequired: { message: 'Refresh is required.', code: 'REFRESH_REQUIRED', id: '18e978be-e2a2-43bb-b81a-58d9049e5195', httpStatusCode: 409 },
	invalidCursor: { message: 'Invalid cursor.', code: 'INVALID_CURSOR', id: '6423bfa7-5e69-4c03-99ed-f0bfbc647c28', httpStatusCode: 400 },
	invalidRequest: { message: 'Invalid request.', code: 'INVALID_REQUEST', id: 'd0201d8b-70e5-41ce-af64-d69e156b3624', httpStatusCode: 400 },
	eventConflict: { message: 'Event conflicts with an earlier request.', code: 'EVENT_CONFLICT', id: '3909a59a-9a53-4b73-8545-a5af5f6488fb', httpStatusCode: 409 },
} as const;
export function hanamiApiError(error: unknown): ApiError {
	if (error instanceof HanamiPlatformError) {
		const definition = Object.values(hanamiApiErrors).find(value => value.code === error.code);
		if (definition) return new ApiError(definition);
	}
	return new ApiError(hanamiApiErrors.unavailable);
}
