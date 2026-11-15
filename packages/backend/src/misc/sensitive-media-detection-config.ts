/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiMeta } from '@/models/Meta.js';

export type SensitiveMediaDetectionConfig = {
	apiUrl?: string;
	apiKey?: string;
	useProxy?: boolean;
	timeout?: number;
	maxImagesPerRequest?: number;
};

export function getSensitiveMediaDetectionConfig(
	config?: SensitiveMediaDetectionConfig,
	meta?: Partial<Pick<MiMeta,
		'sensitiveMediaDetectionApiUrl' |
		'sensitiveMediaDetectionApiKey' |
		'sensitiveMediaDetectionUseProxy' |
		'sensitiveMediaDetectionTimeout' |
		'sensitiveMediaDetectionMaxImagesPerRequest'
	>>,
) {
	return {
		apiUrl: meta?.sensitiveMediaDetectionApiUrl?.trim() || config?.apiUrl?.trim() || null,
		apiKey: meta?.sensitiveMediaDetectionApiKey ?? config?.apiKey ?? null,
		useProxy: meta?.sensitiveMediaDetectionUseProxy ?? config?.useProxy ?? true,
		timeout: meta?.sensitiveMediaDetectionTimeout ?? config?.timeout ?? 60000,
		maxImagesPerRequest: meta?.sensitiveMediaDetectionMaxImagesPerRequest ?? config?.maxImagesPerRequest ?? 4,
	};
}
