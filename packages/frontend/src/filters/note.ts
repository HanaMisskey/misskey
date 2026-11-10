/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { getHanamiNoteContext, hanamiNavigationPath } from '@/utility/hanami-recommendation-context.js';

export const notePage = note => {
	return hanamiNavigationPath(`/notes/${note.id}`, getHanamiNoteContext(note));
};
