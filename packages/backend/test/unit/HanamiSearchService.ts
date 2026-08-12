import { describe, expect, test } from '@jest/globals';
import { buildHanamiSearchDocument } from '@/core/hanamisearch/HanamiSearchService.js';
import { MiNote } from '@/models/Note.js';

function note(over: Partial<MiNote> = {}): MiNote {
	return {
		id: 'a1b2c3',
		userId: 'u1',
		userHost: null,
		channelId: null,
		cw: null,
		text: '本文',
		tags: [],
		fileIds: [],
		emojis: [],
		visibility: 'public',
		...over,
	} as MiNote;
}

describe('buildHanamiSearchDocument', () => {
	// **この試験が守っているのは「送り忘れ」そのもの。**
	//
	// `emojis` を送っていなかったので、live で入った投稿だけカスタム絵文字の
	// 印を持たず、PG から作り直した分と食い違い続けた。突き合わせは毎周それを
	// contentMismatch として出し、昇格が止まった (2026-08-12)。
	//
	// 送っていないことは、送った側からは何も起きない。索引は受け取った分で
	// 文書を作って 200 を返す。**だからここで数える。**
	test('カスタム絵文字を送る（送らないと索引が印を導けない）', () => {
		const document = buildHanamiSearchDocument(note({ emojis: ['apple', 'peach'] }), 1);

		expect(document.emojis).toEqual(['apple', 'peach']);
	});

	// 空の列を `null` に畳むのは索引側の取り決め。畳まずに送ると、同じ投稿でも
	// 経路によって `_source` が変わり、**全件が「中身が違う」になる。**
	test.each([
		['emojis', { emojis: [] as string[] }],
		['tags', { tags: [] as string[] }],
		['fileIds', { fileIds: [] as string[] }],
	])('%s は空なら null に畳む', (field, over) => {
		const document = buildHanamiSearchDocument(note(over), 1);

		expect(document[field as 'emojis' | 'tags' | 'fileIds']).toBeNull();
	});

	// 索引側の写像が読む項目を 1 つでも落とすと、その項目ぶんだけ静かにずれる。
	// 名前を並べて数えるのは、**足りないことに気づく場所をここ 1 か所にする**ため。
	test('索引が読む項目を全部送る', () => {
		const document = buildHanamiSearchDocument(note(), 1);

		expect(Object.keys(document).sort()).toEqual([
			'channelId', 'createdAt', 'cw', 'emojis', 'fileIds', 'id', 'tags', 'text', 'userHost', 'userId',
		]);
	});
});
