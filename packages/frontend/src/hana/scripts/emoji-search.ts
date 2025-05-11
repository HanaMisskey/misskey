import * as Misskey from 'misskey-js';
import EmojiSearch from '@/workers/emoji-search.js?worker';
import { get, set, del } from '@/utility/idb-proxy.js';
import type { SearchIndex } from '@hanamisskey/browser-search';

let emojiSearchWorker: Worker | null = null;
let hasInitialized = false;

if (import.meta.env.MODE !== 'test' && window.localStorage.getItem('enableWasmEmojiSearch') === 'true') {
	emojiSearchWorker = new EmojiSearch();
}

function postMessageWithHandler<T>(opts: {
	worker: Worker;
	message: Record<string, any>;
	expectedType: string;
	handler?: (data: any) => T;
}): Promise<T> {
	return new Promise((resolve, reject) => {
		const inqId = Date.now();
		opts.message.id = inqId;

		function messageHandler(event: MessageEvent) {
			if (event.data.id !== inqId) return;
			if (event.data.type !== opts.expectedType) return;

			opts.worker.removeEventListener('message', messageHandler);

			if (event.data.success) {
				resolve(opts.handler ? opts.handler(event.data) : event.data);
			} else {
				reject(new Error(`Failed to process message of type: ${opts.expectedType}`));
			}
		}

		opts.worker.addEventListener('message', messageHandler);
		opts.worker.postMessage(opts.message);
	});
}

export function initEmojiSearch(emojis?: Misskey.entities.EmojiSimple[]) {
	return new Promise<void>(async (resolve) => {
		if (!emojiSearchWorker || import.meta.env.MODE === 'test') {
			resolve();
			return;
		}

		const preCompiledIndex = await get('emojiSearchIndex');

		if (_DEV_) console.log('Initializing Emoji Search', { preCompiledIndex });

		try {
			await postMessageWithHandler({
				worker: emojiSearchWorker,
				message: { type: 'init', preCompiledIndex: preCompiledIndex instanceof Uint8Array ? preCompiledIndex : undefined },
				expectedType: 'init',
			});

			hasInitialized = true;

			if (preCompiledIndex == null && emojis != null) {
				const emojisToBeIndexed = {
					emojis: emojis.map((emoji) => ({
						name: emoji.name,
						aliases: emoji.aliases,
					})),
				} satisfies SearchIndex;

				await postMessageWithHandler({
					worker: emojiSearchWorker!,
					message: { type: 'createIndex', emojis: emojisToBeIndexed },
					expectedType: 'createIndex',
				});

				await postMessageWithHandler({
					worker: emojiSearchWorker!,
					message: { type: 'dumpIndex' },
					expectedType: 'dumpIndex',
					handler: (dumpData) => set('emojiSearchIndex', dumpData.data),
				});
			}

			resolve();
		} catch (error) {
			console.error('Failed to initialize Emoji Search', error);
			resolve();
		}
	});
}

export async function searchCustomEmojis(query: string, limit = 10) {
	if (!emojiSearchWorker || !hasInitialized) return;

	return await postMessageWithHandler<string[]>({
		worker: emojiSearchWorker,
		message: { type: 'search', query, limit },
		expectedType: 'search',
		handler: (data) => data.data,
	});
}

export async function searchCustomEmojisUnlimited(query: string) {
	if (!emojiSearchWorker || !hasInitialized) return;

	return await postMessageWithHandler<string[]>({
		worker: emojiSearchWorker,
		message: { type: 'searchUnlimited', query },
		expectedType: 'searchUnlimited',
		handler: (data) => data.data,
	});
}

export async function addCustomEmojiToSearchIndex(emoji: Misskey.entities.EmojiSimple) {
	if (!emojiSearchWorker || !hasInitialized) return;

	await postMessageWithHandler({
		worker: emojiSearchWorker,
		message: { type: 'insertIndex', name: emoji.name, aliases: emoji.aliases },
		expectedType: 'insertIndex',
	});
}

export async function updateCustomEmojiOnSearchIndex(emoji: Misskey.entities.EmojiSimple) {
	if (!emojiSearchWorker || !hasInitialized) return;

	await postMessageWithHandler({
		worker: emojiSearchWorker,
		message: { type: 'updateIndex', name: emoji.name, aliases: emoji.aliases },
		expectedType: 'updateIndex',
	});
}

export async function removeCustomEmojiFromSearchIndex(emoji: Misskey.entities.EmojiSimple) {
	if (!emojiSearchWorker || !hasInitialized) return;

	await postMessageWithHandler({
		worker: emojiSearchWorker,
		message: { type: 'removeIndex', name: emoji.name },
		expectedType: 'removeIndex',
	});
}

export async function clearEmojiSearchIndex() {
	if (emojiSearchWorker && hasInitialized) {
		await postMessageWithHandler({
			worker: emojiSearchWorker,
			message: { type: 'clearIndex' },
			expectedType: 'clearIndex',
		});
	}

	await del('emojiSearchIndex');
}


export async function regenerateCustomEmojiSearchIndex(emojis: Misskey.entities.EmojiSimple[]) {
	if (!emojiSearchWorker || !hasInitialized) return;

	await postMessageWithHandler({
		worker: emojiSearchWorker,
		message: { type: 'clearIndex' },
		expectedType: 'clearIndex',
	});

	const emojisToBeIndexed = {
		emojis: emojis.map((emoji) => ({
			name: emoji.name,
			aliases: emoji.aliases,
		})),
	} satisfies SearchIndex;

	await postMessageWithHandler({
		worker: emojiSearchWorker,
		message: { type: 'createIndex', emojis: emojisToBeIndexed },
		expectedType: 'createIndex',
	});

	await postMessageWithHandler({
		worker: emojiSearchWorker,
		message: { type: 'dumpIndex' },
		expectedType: 'dumpIndex',
		handler: (dumpData) => set('emojiSearchIndex', dumpData.data),
	});
}
