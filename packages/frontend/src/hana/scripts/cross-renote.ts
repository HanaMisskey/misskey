import * as Misskey from 'misskey-js';
import { url } from '@@/js/config.js';
import { hanaStore } from '@/hana/store.js';

export type CrossRenoteStore = {
	id: string;
	host: string;
	userId: string;
	username: string;
	token: string;
	serverName?: string;
	localOnly?: boolean;
	visibilityOverride?: Exclude<Misskey.entities.Note['visibility'], 'specified'>;
};

export async function crossRenote({ createdNote, accountIds }: { createdNote: Misskey.entities.Note, accountIds: string[] }): Promise<void> {
	const crossRenoteAccounts = hanaStore.state.crossRenoteAccounts.filter(account => accountIds.includes(account.id));
	const renotePromises: Promise<void>[] = [];

	if (createdNote.visibility === 'specified' || createdNote.visibility === 'followers' || createdNote.localOnly === true) return;

	for (const account of crossRenoteAccounts) {
		renotePromises.push((async () => {
			let computedVisibility: Misskey.entities.Note['visibility'];

			if (createdNote.visibility === 'home') {
				if (account.visibilityOverride && account.visibilityOverride !== 'public') {
					computedVisibility = account.visibilityOverride;
				} else {
					computedVisibility = 'home';
				}
			} else {
				computedVisibility = account.visibilityOverride ?? createdNote.visibility;
			}

			const apFetch = await window.fetch(`https://${account.host}/api/ap/show`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					i: account.token,
					uri: `${url}/notes/${createdNote.id}`,
				} as Misskey.entities.ApShowRequest & { i: string }),
			});

			if (!apFetch.ok) {
				return;
			}

			const apNote = await apFetch.json() as Misskey.entities.ApShowResponse;

			if (apNote.type !== 'Note') {
				return;
			}

			await window.fetch(`https://${account.host}/api/notes/create`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					i: account.token,
					renoteId: apNote.object.id,
					visibility: computedVisibility,
					localOnly: account.localOnly ?? false,
				} as Misskey.entities.NotesCreateRequest & { i: string }),
			});
		})());
	}

	await Promise.all(renotePromises);
}
