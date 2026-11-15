/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as os from '@/os.js';
import { i18n } from '@/i18n.js';

export async function copyToClipboard(input: string | null): Promise<boolean> {
	if (!input) return false;
	try {
		await navigator.clipboard.writeText(input);
	} catch {
		return false;
	}
	os.toast(i18n.ts.copiedToClipboard);
	return true;
}
