/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type SensitiveMediaDetectionConfig = {
	apiUrl?: string;
	apiKey?: string;
	useProxy?: boolean;
	timeout?: number;
	maxImagesPerRequest?: number;
};

type SensitiveMediaDetectionOverrides = {
	sensitiveMediaDetectionApiUrl?: string | null;
	sensitiveMediaDetectionApiKey?: string | null;
	sensitiveMediaDetectionUseProxy?: boolean | null;
	sensitiveMediaDetectionTimeout?: number | null;
	sensitiveMediaDetectionMaxImagesPerRequest?: number | null;
};

export type ResolvedSensitiveMediaDetectionConfig = {
	apiUrl: string | null;
	apiKey: string | null;
	useProxy: boolean;
	timeout: number;
	maxImagesPerRequest: number;
};

export function resolveSensitiveMediaDetectionConfig(
	fileConfig?: SensitiveMediaDetectionConfig,
	meta?: SensitiveMediaDetectionOverrides,
): ResolvedSensitiveMediaDetectionConfig {
	return {
		apiUrl: meta?.sensitiveMediaDetectionApiUrl?.trim() || fileConfig?.apiUrl?.trim() || null,
		apiKey: meta?.sensitiveMediaDetectionApiKey ?? fileConfig?.apiKey ?? null,
		useProxy: meta?.sensitiveMediaDetectionUseProxy ?? fileConfig?.useProxy ?? true,
		timeout: meta?.sensitiveMediaDetectionTimeout ?? fileConfig?.timeout ?? 60000,
		maxImagesPerRequest: meta?.sensitiveMediaDetectionMaxImagesPerRequest ?? fileConfig?.maxImagesPerRequest ?? 4,
	};
}

export function validateSensitiveMediaDetectionConfig(input: unknown): SensitiveMediaDetectionConfig | undefined {
	if (input === undefined) return undefined;
	if (typeof input !== 'object' || input === null || Array.isArray(input)) {
		throw new Error('sensitiveMediaDetection must be an object');
	}

	const config = input as Record<string, unknown>;
	if (config.apiUrl !== undefined) {
		if (typeof config.apiUrl !== 'string') {
			throw new Error('sensitiveMediaDetection.apiUrl must be a string');
		}
		if (config.apiUrl.trim() !== '') {
			let url: URL;
			try {
				url = new URL(config.apiUrl);
			} catch {
				throw new Error('sensitiveMediaDetection.apiUrl must be an HTTP(S) URL');
			}
			if (url.protocol !== 'http:' && url.protocol !== 'https:') {
				throw new Error('sensitiveMediaDetection.apiUrl must be an HTTP(S) URL');
			}
		}
	}
	if (config.apiKey !== undefined && typeof config.apiKey !== 'string') {
		throw new Error('sensitiveMediaDetection.apiKey must be a string');
	}
	if (config.useProxy !== undefined && typeof config.useProxy !== 'boolean') {
		throw new Error('sensitiveMediaDetection.useProxy must be a boolean');
	}
	for (const field of ['timeout', 'maxImagesPerRequest'] as const) {
		const value = config[field];
		if (value !== undefined && (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 2147483647)) {
			throw new Error(`sensitiveMediaDetection.${field} must be an integer between 1 and 2147483647`);
		}
	}
	return config as SensitiveMediaDetectionConfig;
}
