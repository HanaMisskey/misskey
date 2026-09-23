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
