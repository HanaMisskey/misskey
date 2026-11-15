import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { HanaReactionMuteService } from '@/core/HanaReactionMuteService.js';
import { IdService } from '@/core/IdService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { NoteStreamingHidingService } from '@/server/api/stream/NoteStreamingHidingService.js';
import { AntennaChannel } from '@/server/api/stream/channels/antenna.js';
import type { Packed } from '@/misc/json-schema.js';
import type { ChannelRequest } from '@/server/api/stream/channel.js';

const now = new Date('2026-10-25T00:00:00.000Z');
const viewerId = 'viewer';
const otherViewerId = 'other-viewer';
const mutedUserId = 'muted-reactor';
const otherUserId = 'other-reactor';

function createNote(idService: IdService, age: number, userId: string): Packed<'Note'> {
	return {
		id: idService.gen(now.getTime() - age),
		createdAt: new Date(now.getTime() - age).toISOString(),
		userId,
		user: { id: userId, username: userId, name: null, host: null, avatarUrl: '/avatar.png', avatarBlurhash: null, avatarDecorations: [], emojis: {}, onlineStatus: 'unknown' },
		text: 'public note',
		cw: null,
		visibility: 'public',
		fileIds: [],
		reactionAcceptance: null,
		reactionEmojis: {},
		reactions: {},
		reactionCount: 0,
		renoteCount: 0,
		repliesCount: 0,
	};
}

/**
 * Oracle: 公開ノートの純リノートを自分の空keywordsアンテナで受信する契約。
 * DB上でミュート対象者の反応を一度だけ除き、自分の反応と投票を保持する。
 * 取消済みの自分の反応は、残存するpairよりDBの不在を優先する。
 * アンテナの選別後のイベントを入力し、配信・ミュート・投票・自己反応補完は実サービスを通す。
 */
describe('アンテナが配信する純リノートの自己反応', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(now);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	function createFixture({ hasPoll = true, cancelled = false, age = 1000 } = {}) {
		const idService = new IdService({ id: 'aidx' } as never);
		const inner = createNote(idService, age, 'author');
		inner.reactions = { '❤': cancelled ? 1 : 2 };
		inner.reactionCount = cancelled ? 1 : 2;
		inner.reactionAndUserPairCache = cancelled ? [`${viewerId}/❤`, `${otherUserId}/❤`] : [`${viewerId}/❤`, `${mutedUserId}/❤`];
		if (hasPoll) {
			inner.poll = { multiple: false, expiresAt: null, choices: [{ text: 'yes', votes: 1, isVoted: false }, { text: 'no', votes: 0, isVoted: false }] };
		}
		const note = {
			...createNote(idService, 0, 'renoter'),
			text: null,
			renoteId: inner.id,
			renote: inner,
		};
		const rows = cancelled
			? [{ noteId: inner.id, userId: otherUserId, reaction: '❤' }]
			: [{ noteId: inner.id, userId: viewerId, reaction: '❤' }, { noteId: inner.id, userId: mutedUserId, reaction: '❤' }];
		const noteReactionsRepository = {
			find: vi.fn(async ({ where }: { where: { userId: { value: string[] }; noteId: { value: string[] } } }) => rows.filter(row => where.userId.value.includes(row.userId) && where.noteId.value.includes(row.noteId))),
			findOneBy: vi.fn(async ({ userId, noteId }: { userId: string; noteId: string }) => rows.find(row => row.userId === userId && row.noteId === noteId) ?? null),
		};
		const pollsRepository = { findOneByOrFail: vi.fn().mockResolvedValue({ choices: ['yes', 'no'], votes: [1, 0], multiple: false, expiresAt: null }) };
		const pollVotesRepository = { findOneBy: vi.fn(async ({ userId }: { userId: string }) => userId === viewerId ? { userId: viewerId, noteId: inner.id, choice: 0 } : null) };
		const notesRepository = { findOneOrFail: vi.fn(() => { throw new Error('The stream already contains the note'); }) };
		const cacheService = { userMutingsCache: { fetch: vi.fn(async (userId: string) => new Set(userId === viewerId ? [mutedUserId] : [])) } };
		const reactionService = { convertLegacyReaction: (reaction: string) => reaction };
		const hanaReactionMuteService = new HanaReactionMuteService(noteReactionsRepository as never, cacheService as never, reactionService as never);
		const services = new Map<string, unknown>([
			['ReactionService', reactionService],
			['IdService', idService],
			['CacheService', cacheService],
			['HanaReactionMuteService', hanaReactionMuteService],
		]);
		const noteEntityService = new NoteEntityService(
			{ get: (name: string) => services.get(name) } as never,
			{} as never, {} as never, notesRepository as never, {} as never,
			pollsRepository as never, pollVotesRepository as never, noteReactionsRepository as never, {} as never,
		);
		noteEntityService.onModuleInit();
		const hidingService = new NoteStreamingHidingService({ ugcVisibilityForVisitor: 'all' } as never, noteEntityService);
		const antennasRepository = { exists: vi.fn(async ({ where }: { where: { id: string; userId: string } }) => where.id === 'own-empty-keywords-antenna' && [viewerId, otherViewerId].includes(where.userId)) };

		async function receive(userId = viewerId) {
			const subscriber = new EventEmitter();
			const sendMessageToWs = vi.fn();
			const channel = new AntennaChannel({
				id: 'connection',
				connection: {
					user: { id: userId }, subscriber, sendMessageToWs,
					userIdsWhoMeMuting: new Set(userId === viewerId ? [mutedUserId] : []),
					userIdsWhoMeMutingRenotes: new Set(), userIdsWhoBlockingMe: new Set(),
					userMutedInstances: new Set(), mutingChannels: new Set(),
				},
			} as unknown as ChannelRequest, antennasRepository as never, noteEntityService, hidingService);
			expect(await channel.init({ antennaId: 'own-empty-keywords-antenna' })).toBe(true);
			try {
				const listeners = subscriber.listeners('antennaStream:own-empty-keywords-antenna');
				expect(listeners).toHaveLength(1);
				await listeners[0]({ type: 'note', body: note });
				expect(sendMessageToWs).toHaveBeenCalledTimes(1);
				return sendMessageToWs.mock.calls[0][1].body as Packed<'Note'>;
			} finally {
				channel.dispose();
			}
		}

		return { note, receive, pollsRepository, pollVotesRepository, notesRepository, antennasRepository };
	}

	/** 自分とミュート対象の❤各1件から表示は❤1件。作成1秒後でも自分の❤とyesへの投票を保持する。 */
	test('投票付きの新しい内側ノートで、ミュート対象を除いた自分の反応と投票を保持する', async () => {
		const fixture = createFixture();
		const received = await fixture.receive();
		expect(received.renote?.reactions).toEqual({ '❤': 1 });
		expect(received.renote?.reactionCount).toBe(1);
		expect(received.renote?.poll?.choices.map(choice => choice.isVoted)).toEqual([true, false]);
		expect(received.renote?.myReaction).toBe('❤');
	});

	/** 取消後のDBには他人の❤1件だけがあり、自分の古いpairが残っていても自己反応にはならない。 */
	test('投票付きの古い内側ノートで、残存pairから取消済みの自分の反応を復活させない', async () => {
		const fixture = createFixture({ cancelled: true, age: 60_000 });
		const received = await fixture.receive();
		expect(received.renote?.reactions).toEqual({ '❤': 1 });
		expect(received.renote?.reactionCount).toBe(1);
		expect(received.renote?.poll?.choices.map(choice => choice.isVoted)).toEqual([true, false]);
		expect(received.renote?.myReaction).toBeUndefined();
	});

	/** 投票なしでも同じ公開の純リノート契約を保ち、配信済み本文をDBから再取得する必要はない。 */
	test.each([false, true])('非アンケートの内側ノートでは自己反応の有無を保持し再packしない（取消=$0）', async (cancelled) => {
		const fixture = createFixture({ hasPoll: false, cancelled });
		const received = await fixture.receive();
		expect(received.renote?.reactions).toEqual({ '❤': 1 });
		expect(received.renote?.reactionCount).toBe(1);
		expect(received.renote?.myReaction).toBe(cancelled ? undefined : '❤');
		expect(fixture.pollsRepository.findOneByOrFail).not.toHaveBeenCalled();
		expect(fixture.pollVotesRepository.findOneBy).not.toHaveBeenCalled();
		expect(fixture.notesRepository.findOneOrFail).not.toHaveBeenCalled();
	});

	/** 同じ配信入力を見る別の閲覧者は2件とも見える。最初の閲覧者のミュート結果を共有入力へ戻さない。 */
	test('閲覧者ごとに受信結果を分け、共有入力の反応件数と投票を変更しない', async () => {
		const fixture = createFixture();
		const original = structuredClone(fixture.note);
		await fixture.receive();
		const received = await fixture.receive(otherViewerId);
		expect(received.renote?.reactions).toEqual({ '❤': 2 });
		expect(received.renote?.reactionCount).toBe(2);
		expect(received.renote?.myReaction).toBeUndefined();
		expect(received.renote?.poll?.choices.map(choice => choice.isVoted)).toEqual([false, false]);
		expect(fixture.note).toEqual(original);
	});
});
