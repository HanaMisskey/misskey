/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { notePage as sharedNotePage } from '@@/js/note.js';
import { userPage as sharedUserPage } from '@@/js/user.js';
import { getHanamiNoteContext, getHanamiUserContext, hanamiNavigationPath } from '@/utility/hanami-recommendation-context.js';
import type { HanamiDisplayEvent } from '@/utility/hanami-impressions.js';

export const notePage = (note: { id: string; recommendationEvent?: HanamiDisplayEvent }): string => {
	return hanamiNavigationPath(sharedNotePage(note), getHanamiNoteContext(note));
};

export const userPage = (user: Misskey.Acct & { id?: string; hanamiRecommendation?: string }, path?: string, absolute = false): string => {
	const target = sharedUserPage(user, path, absolute);
	return absolute || path ? target : hanamiNavigationPath(target, getHanamiUserContext(user));
};
