/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { api, connectStream, initTestDb, post, react, signup, userList, waitFire } from '../utils.js';
import { GlobalModule } from '@/GlobalModule.js';
import { CoreModule } from '@/core/CoreModule.js';
import { CustomEmojiService } from '@/core/CustomEmojiService.js';
import { IdService } from '@/core/IdService.js';
import { ReactionService } from '@/core/ReactionService.js';
import { ReactionsBufferingService } from '@/core/ReactionsBufferingService.js';
import { DI } from '@/di-symbols.js';
import type { EmojisRepository, MiMeta, MiUser, NotesRepository, UserProfilesRepository, UsersRepository } from '@/models/_.js';
import type * as misskey from 'misskey-js';

const waitForPushToTlOptions = { timeout: 3000, interval: 25 };

describe('Mute', () => {
	// alice mutes carol
	let alice: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;
	let carol: misskey.entities.SignupResponse;

	beforeAll(async () => {
		alice = await signup({ username: 'alice' });
		bob = await signup({ username: 'bob' });
		carol = await signup({ username: 'carol' });

		// Mute: alice ==> carol
		await api('mute/create', {
			userId: carol.id,
		}, alice);
	}, 1000 * 60 * 2);

	test('ミュート作成', async () => {
		const res = await api('mute/create', {
			userId: bob.id,
		}, alice);

		assert.strictEqual(res.status, 204);

		// 単体でも走らせられるように副作用消す
		await api('mute/delete', {
			userId: bob.id,
		}, alice);
	});

	test('「自分宛ての投稿」にミュートしているユーザーの投稿が含まれない', async () => {
		const bobNote = await post(bob, { text: '@alice hi' });
		const carolNote = await post(carol, { text: '@alice hi' });

		const res = await api('notes/mentions', {}, alice);

		assert.strictEqual(res.status, 200);
		assert.strictEqual(Array.isArray(res.body), true);
		assert.strictEqual(res.body.some(note => note.id === bobNote.id), true);
		assert.strictEqual(res.body.some(note => note.id === carolNote.id), false);
	});

	test('ミュートしているユーザーからメンションされても、ストリームに unreadNotification イベントが流れてこない', async () => {
		// 状態リセット
		await api('notifications/mark-all-as-read', {}, alice);

		const fired = await waitFire(alice, 'main', () => post(carol, { text: '@alice hi' }), msg => msg.type === 'unreadNotification');

		assert.strictEqual(fired, false);
	});

	describe('Timeline', () => {
		test('タイムラインにミュートしているユーザーの投稿が含まれない', async () => {
			const aliceNote = await post(alice, { text: 'hi' });
			const bobNote = await post(bob, { text: 'hi' });
			const carolNote = await post(carol, { text: 'hi' });

			await vi.waitFor(async () => {
				const res = await api('notes/local-timeline', {}, alice);

				assert.strictEqual(res.status, 200);
				assert.strictEqual(Array.isArray(res.body), true);
				assert.strictEqual(res.body.some(note => note.id === aliceNote.id), true);
				assert.strictEqual(res.body.some(note => note.id === bobNote.id), true);
				assert.strictEqual(res.body.some(note => note.id === carolNote.id), false);
			}, waitForPushToTlOptions);
		});

		test('タイムラインにミュートしているユーザーの投稿のRenoteが含まれない', async () => {
			const aliceNote = await post(alice, { text: 'hi' });
			const carolNote = await post(carol, { text: 'hi' });
			const bobNote = await post(bob, {
				renoteId: carolNote.id,
			});

			await vi.waitFor(async () => {
				const res = await api('notes/local-timeline', {}, alice);

				assert.strictEqual(res.status, 200);
				assert.strictEqual(Array.isArray(res.body), true);
				assert.strictEqual(res.body.some(note => note.id === aliceNote.id), true);
				assert.strictEqual(res.body.some(note => note.id === bobNote.id), false);
				assert.strictEqual(res.body.some(note => note.id === carolNote.id), false);
			}, waitForPushToTlOptions);
		});
	});

	describe('Notification', () => {
		test('通知にミュートしているユーザーの通知が含まれない(リアクション)', async () => {
			const aliceNote = await post(alice, { text: 'hi' });
			await react(bob, aliceNote, 'like');
			await react(carol, aliceNote, 'like');

			const res = await api('i/notifications', {}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(Array.isArray(res.body), true);
			assert.strictEqual(res.body.some(notification => 'userId' in notification && notification.userId === bob.id), true);
			assert.strictEqual(res.body.some(notification => 'userId' in notification && notification.userId === carol.id), false);
		});

		test('通知にミュートしているユーザーからのリプライが含まれない', async () => {
			const aliceNote = await post(alice, { text: 'hi' });
			await post(bob, { text: '@alice hi', replyId: aliceNote.id });
			await post(carol, { text: '@alice hi', replyId: aliceNote.id });

			const res = await api('i/notifications', {}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(Array.isArray(res.body), true);

			assert.strictEqual(res.body.some(notification => 'userId' in notification && notification.userId === bob.id), true);
			assert.strictEqual(res.body.some(notification => 'userId' in notification && notification.userId === carol.id), false);
		});

		test('通知にミュートしているユーザーからのリプライが含まれない', async () => {
			await post(alice, { text: 'hi' });
			await post(bob, { text: '@alice hi' });
			await post(carol, { text: '@alice hi' });

			const res = await api('i/notifications', {}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(Array.isArray(res.body), true);

			assert.strictEqual(res.body.some(notification => 'userId' in notification && notification.userId === bob.id), true);
			assert.strictEqual(res.body.some(notification => 'userId' in notification && notification.userId === carol.id), false);
		});

		test('通知にミュートしているユーザーからの引用リノートが含まれない', async () => {
			const aliceNote = await post(alice, { text: 'hi' });
			await post(bob, { text: 'hi', renoteId: aliceNote.id });
			await post(carol, { text: 'hi', renoteId: aliceNote.id });

			const res = await api('i/notifications', {}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(Array.isArray(res.body), true);

			assert.strictEqual(res.body.some(notification => 'userId' in notification && notification.userId === bob.id), true);
			assert.strictEqual(res.body.some(notification => 'userId' in notification && notification.userId === carol.id), false);
		});

		test('通知にミュートしているユーザーからのリノートが含まれない', async () => {
			const aliceNote = await post(alice, { text: 'hi' });
			await post(bob, { renoteId: aliceNote.id });
			await post(carol, { renoteId: aliceNote.id });

			const res = await api('i/notifications', {}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(Array.isArray(res.body), true);

			assert.strictEqual(res.body.some(notification => 'userId' in notification && notification.userId === bob.id), true);
			assert.strictEqual(res.body.some(notification => 'userId' in notification && notification.userId === carol.id), false);
		});

		test('通知にミュートしているユーザーからのフォロー通知が含まれない', async () => {
			await api('following/create', { userId: alice.id }, bob);
			await api('following/create', { userId: alice.id }, carol);

			const res = await api('i/notifications', {}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(Array.isArray(res.body), true);

			assert.strictEqual(res.body.some(notification => 'userId' in notification && notification.userId === bob.id), true);
			assert.strictEqual(res.body.some(notification => 'userId' in notification && notification.userId === carol.id), false);

			await api('following/delete', { userId: alice.id }, bob);
			await api('following/delete', { userId: alice.id }, carol);
		});

		test('通知にミュートしているユーザーからのフォローリクエストが含まれない', async () => {
			await api('i/update', { isLocked: true }, alice);
			await api('following/create', { userId: alice.id }, bob);
			await api('following/create', { userId: alice.id }, carol);

			const res = await api('i/notifications', {}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(Array.isArray(res.body), true);

			assert.strictEqual(res.body.some(notification => 'userId' in notification && notification.userId === bob.id), true);
			assert.strictEqual(res.body.some(notification => 'userId' in notification && notification.userId === carol.id), false);

			await api('following/delete', { userId: alice.id }, bob);
			await api('following/delete', { userId: alice.id }, carol);
		});
	});

	describe('Notification (Grouped)', () => {
		test('通知にミュートしているユーザーの通知が含まれない(リアクション)', async () => {
			const aliceNote = await post(alice, { text: 'hi' });
			await react(bob, aliceNote, 'like');
			await react(carol, aliceNote, 'like');

			const res = await api('i/notifications-grouped', {}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(Array.isArray(res.body), true);
			assert.strictEqual(res.body.some(notification => 'userId' in notification && notification.userId === bob.id), true);
			assert.strictEqual(res.body.some(notification => 'userId' in notification && notification.userId === carol.id), false);
		});
		test('通知にミュートしているユーザーからのリプライが含まれない', async () => {
			const aliceNote = await post(alice, { text: 'hi' });
			await post(bob, { text: '@alice hi', replyId: aliceNote.id });
			await post(carol, { text: '@alice hi', replyId: aliceNote.id });

			const res = await api('i/notifications-grouped', {}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(Array.isArray(res.body), true);

			assert.strictEqual(res.body.some(notification => 'userId' in notification && notification.userId === bob.id), true);
			assert.strictEqual(res.body.some(notification => 'userId' in notification && notification.userId === carol.id), false);
		});

		test('通知にミュートしているユーザーからのリプライが含まれない', async () => {
			await post(alice, { text: 'hi' });
			await post(bob, { text: '@alice hi' });
			await post(carol, { text: '@alice hi' });

			const res = await api('i/notifications-grouped', {}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(Array.isArray(res.body), true);

			assert.strictEqual(res.body.some(notification => 'userId' in notification && notification.userId === bob.id), true);
			assert.strictEqual(res.body.some(notification => 'userId' in notification && notification.userId === carol.id), false);
		});

		test('通知にミュートしているユーザーからの引用リノートが含まれない', async () => {
			const aliceNote = await post(alice, { text: 'hi' });
			await post(bob, { text: 'hi', renoteId: aliceNote.id });
			await post(carol, { text: 'hi', renoteId: aliceNote.id });

			const res = await api('i/notifications-grouped', {}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(Array.isArray(res.body), true);

			assert.strictEqual(res.body.some(notification => 'userId' in notification && notification.userId === bob.id), true);
			assert.strictEqual(res.body.some(notification => 'userId' in notification && notification.userId === carol.id), false);
		});

		test('通知にミュートしているユーザーからのリノートが含まれない', async () => {
			const aliceNote = await post(alice, { text: 'hi' });
			await post(bob, { renoteId: aliceNote.id });
			await post(carol, { renoteId: aliceNote.id });

			const res = await api('i/notifications-grouped', {}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(Array.isArray(res.body), true);

			assert.strictEqual(res.body.some(notification => 'userId' in notification && notification.userId === bob.id), true);
			assert.strictEqual(res.body.some(notification => 'userId' in notification && notification.userId === carol.id), false);
		});

		test('通知にミュートしているユーザーからのフォロー通知が含まれない', async () => {
			await api('following/create', { userId: alice.id }, bob);
			await api('following/create', { userId: alice.id }, carol);

			const res = await api('i/notifications-grouped', {}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(Array.isArray(res.body), true);

			assert.strictEqual(res.body.some(notification => 'userId' in notification && notification.userId === bob.id), true);
			assert.strictEqual(res.body.some(notification => 'userId' in notification && notification.userId === carol.id), false);

			await api('following/delete', { userId: alice.id }, bob);
			await api('following/delete', { userId: alice.id }, carol);
		});

		test('通知にミュートしているユーザーからのフォローリクエストが含まれない', async () => {
			await api('i/update', { isLocked: true }, alice);
			await api('following/create', { userId: alice.id }, bob);
			await api('following/create', { userId: alice.id }, carol);

			const res = await api('i/notifications-grouped', {}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(Array.isArray(res.body), true);

			assert.strictEqual(res.body.some(notification => 'userId' in notification && notification.userId === bob.id), true);
			assert.strictEqual(res.body.some(notification => 'userId' in notification && notification.userId === carol.id), false);
		});
	});

	describe('Reaction counts for muted users', () => {
		let app: TestingModule;
		let notes: NotesRepository;
		let users: UsersRepository;
		let writer: ReactionService;
		let buffering: ReactionsBufferingService;
		let idService: IdService;
		let muted: MiUser;
		let unmuted: MiUser;
		let remoteMuted: MiUser;
		let remoteUnmuted: MiUser;

		async function createActor(host: string | null = null) {
			const id = idService.gen();
			await users.insert({ id, username: `reactor_${id}`, usernameLower: `reactor_${id}`, host });
			await app.get<UserProfilesRepository>(DI.userProfilesRepository).insert({ userId: id });
			return users.findOneByOrFail({ id });
		}

		async function setBuffering(enabled: boolean) {
			const res = await api('admin/update-meta', { enableReactionsBuffering: enabled }, alice);
			expect(res.status).toBe(204);
			await vi.waitFor(() => expect(app.get<MiMeta>(DI.meta).enableReactionsBuffering).toBe(enabled));
		}

		async function addReaction(actor: MiUser, noteId: string, reaction = '👍') {
			await writer.create(actor, await notes.findOneByOrFail({ id: noteId }), reaction);
		}

		async function flush(noteId: string, storedReaction: string, count: number) {
			await buffering.bake();
			// bake submits the DB write asynchronously; observe its completion before the next phase.
			await vi.waitFor(async () => {
				const note = await notes.findOneByOrFail({ id: noteId });
				expect(note.reactions[storedReaction]).toBe(count);
			});
		}

		function expectReactions(note: { reactions: Record<string, number>; reactionCount?: number }, reaction: string, count: number, withCount = true) {
			expect.soft(note.reactions).toEqual({ [reaction]: count });
			if (withCount) expect.soft(note.reactionCount).toBe(count);
		}

		async function show(noteId: string, viewer = alice) {
			const res = await api('notes/show', { noteId }, viewer);
			expect(res.status).toBe(200);
			return res.body;
		}

		async function partial(noteId: string, viewer = alice) {
			const res = await api('notes/show-partial-bulk', { noteIds: [noteId] }, viewer);
			expect(res.status).toBe(200);
			expect(res.body.map(note => note.id)).toEqual([noteId]);
			return res.body[0];
		}

		beforeAll(async () => {
			const db = await initTestDb(true);
			app = await Test.createTestingModule({ imports: [GlobalModule, CoreModule] })
				.overrideProvider(DI.db).useValue(db)
				.compile();
			await app.init();
			notes = app.get(DI.notesRepository);
			users = app.get(DI.usersRepository);
			writer = app.get(ReactionService);
			buffering = app.get(ReactionsBufferingService);
			idService = app.get(IdService);
			muted = await users.findOneByOrFail({ id: carol.id });
			unmuted = await users.findOneByOrFail({ id: bob.id });
			remoteMuted = await createActor('reactions.example');
			remoteUnmuted = await createActor('reactions.example');
			expect((await api('mute/create', { userId: remoteMuted.id }, alice)).status).toBe(204);
			const emojis = app.get<EmojisRepository>(DI.emojisRepository);
			for (const host of [null, 'reactions.example']) {
				await emojis.insert({ id: idService.gen(), name: 'mute_test', host, originalUrl: 'https://example.invalid/emoji.png', publicUrl: 'https://example.invalid/emoji.png' });
			}
			await app.get(CustomEmojiService).localEmojisCache.refresh();
		});

		beforeEach(async () => {
			await setBuffering(false);
		});

		afterAll(async () => {
			await buffering.bake();
			await setBuffering(false);
			await app.close();
		});

		/**
		 * Oracle: M and U each have one accepted reaction of the same kind. Alice mutes
		 * M only, so she sees U's one reaction; Bob mutes neither and sees both.
		 * The remote shortcode is resolved by the real writer using actor.host.
		 */
		describe.each([false, true])('buffering = %s', (enabled) => {
			test.each([
				['Unicode', '👍', '👍', '👍'],
				['local custom', ':mute_test:', ':mute_test@.:', ':mute_test:'],
				['remote custom', ':mute_test:', ':mute_test@reactions.example:', ':mute_test@reactions.example:'],
			])('%s remains viewer-specific in full and partial HTTP reads', async (kind, input, packed, stored) => {
				await setBuffering(enabled);
				const note = await post(bob, { text: 'reaction visibility' });
				await addReaction(kind === 'remote custom' ? remoteMuted : muted, note.id, input);
				await addReaction(kind === 'remote custom' ? remoteUnmuted : unmuted, note.id, input);
				expectReactions(await show(note.id, bob), packed, 2);
				expectReactions(await partial(note.id, bob), packed, 2, false);
				expectReactions(await show(note.id), packed, 1);
				expectReactions(await partial(note.id), packed, 1, false);
				if (enabled) await flush(note.id, stored, 2);
			});
		});

		/** Oracle: nesting does not change the two accepted actors or Alice's one-user mute. */
		test.each(['pure renote', 'reply', 'renote of a quote'])('filters the actual reacted note inside a %s', async (shape) => {
			const inner = await post(bob, { text: 'reacted original' });
			await addReaction(muted, inner.id);
			await addReaction(unmuted, inner.id);
			let outer: misskey.entities.Note;
			if (shape === 'reply') {
				outer = await post(bob, { text: 'reply', replyId: inner.id });
			} else if (shape === 'renote of a quote') {
				const quote = await post(bob, { text: 'quote', renoteId: inner.id });
				outer = await post(bob, { renoteId: quote.id });
			} else {
				outer = await post(bob, { renoteId: inner.id });
			}
			const control = await show(outer.id, bob);
			const filtered = await show(outer.id);
			const innerOf = (note: misskey.entities.Note) => shape === 'reply' ? note.reply! : shape === 'pure renote' ? note.renote! : note.renote!.renote!;
			expect(innerOf(control).id).toBe(inner.id);
			expectReactions(innerOf(control), '👍', 2);
			expectReactions(innerOf(filtered), '👍', 1);
		});

		/** Oracle: both REST list entries describe the same two reactions and one muted actor. */
		test('filters common packed-note list reads through replies and a DB timeline', async () => {
			expect((await api('admin/update-meta', { enableFanoutTimeline: false }, alice)).status).toBe(204);
			await vi.waitFor(() => expect(app.get<MiMeta>(DI.meta).enableFanoutTimeline).toBe(false));
			const parent = await post(alice, { text: 'parent' });
			const reply = await post(alice, { text: 'self reply', replyId: parent.id });
			await addReaction(muted, reply.id);
			await addReaction(unmuted, reply.id);
			const replies = await api('notes/replies', { noteId: parent.id }, alice);
			expect(replies.status).toBe(200);
			expect(replies.body.map(note => note.id)).toEqual([reply.id]);
			expectReactions(replies.body[0], '👍', 1);
			const timeline = await api('notes/timeline', { limit: 100 }, alice);
			expect(timeline.status).toBe(200);
			const entry = timeline.body.find(note => note.id === reply.id);
			expect(entry).toBeDefined();
			expectReactions(entry!, '👍', 1);
		});

		/**
		 * Oracle: a persisted M reaction plus a buffered U reaction is two current actors,
		 * with one visible to Alice. Cancelling M leaves U; Alice's later reaction makes two.
		 * The same arithmetic applies before and after each flush.
		 */
		test('does not subtract a persisted mute twice or subtract a cancelled reaction', async () => {
			const note = await post(bob, { text: 'buffer lifecycle' });
			await addReaction(muted, note.id);
			await setBuffering(true);
			await addReaction(unmuted, note.id);
			expectReactions(await show(note.id, bob), '👍', 2);
			expectReactions(await show(note.id), '👍', 1);
			await flush(note.id, '👍', 2);
			expectReactions(await show(note.id), '👍', 1);
			await writer.delete(muted, await notes.findOneByOrFail({ id: note.id }));
			expectReactions(await show(note.id, bob), '👍', 1);
			expectReactions(await show(note.id), '👍', 1);
			const self = await users.findOneByOrFail({ id: alice.id });
			await addReaction(self, note.id);
			expectReactions(await show(note.id), '👍', 2);
			await flush(note.id, '👍', 2);
			expectReactions(await show(note.id), '👍', 2);
		});

		/** Oracle: 24 unmuted actors plus the last muted actor leave exactly 24 reactions. */
		test('excludes a muted reaction beyond the pair cache', async () => {
			const note = await post(bob, { text: 'more reactions than the cache can hold' });
			for (let i = 0; i < 24; i++) await addReaction(await createActor(), note.id);
			await addReaction(muted, note.id);
			const persisted = await notes.findOneByOrFail({ id: note.id });
			expect(persisted.reactionAndUserPairCache.some(pair => pair.startsWith(`${muted.id}/`))).toBe(false);
			expectReactions(await show(note.id, bob), '👍', 25);
			expectReactions(await show(note.id), '👍', 24);
		});

		/**
		 * Oracle: Alice and M each react once; Alice mutes M, so her WS renote has
		 * one inner reaction and her own myReaction. Bob sees both.
		 */
		test('keeps userList stream reactions and self reaction specific to each viewer', async () => {
			const self = await users.findOneByOrFail({ id: alice.id });
			let inner: misskey.entities.Note | undefined;
			const received = new Map<string, misskey.entities.Note>();
			const sockets = [];
			try {
				for (const viewer of [alice, bob]) {
					const list = await userList(viewer);
					expect((await api('users/lists/push', { listId: list.id, userId: bob.id }, viewer)).status).toBe(204);
					sockets.push(await connectStream(viewer, 'userList', message => {
						if (inner && message.type === 'note' && message.body.renoteId === inner.id) received.set(viewer.id, message.body);
					}, { listId: list.id }));
				}
				inner = await post(bob, { text: 'streamed reactions' });
				await addReaction(muted, inner.id);
				await addReaction(self, inner.id);
				await post(bob, { renoteId: inner.id });
				await vi.waitFor(() => expect(received.size).toBe(2), { timeout: 3000, interval: 25 });
				expectReactions(received.get(bob.id)!.renote!, '👍', 2);
				expectReactions(received.get(alice.id)!.renote!, '👍', 1);
				expect(received.get(alice.id)!.renote!.myReaction).toBe('👍');
			} finally {
				for (const socket of sockets) socket.close();
			}
		});
	});
});
