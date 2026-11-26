/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { UserListChannel } from '@/server/api/stream/channels/user-list.js';
import type { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import type { Packed } from '@/misc/json-schema.js';
import type { UserListMembershipsRepository, UserListsRepository } from '@/models/_.js';
import type { ChannelRequest } from '@/server/api/stream/channel.js';
import type { NoteStreamingHidingService } from '@/server/api/stream/NoteStreamingHidingService.js';

const listId = 'list';
const listEvent = `internalUserListStream:${listId}`;
const viewer = 'viewer';
const initialMember = 'initial-member';
const currentMember = 'current-member';

describe('UserListChannel', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	function fixture() {
		const lists = mock<UserListsRepository>();
		lists.exists.mockResolvedValue(true);
		const memberships = mock<UserListMembershipsRepository>();
		const setMember = (userId: string) => memberships.find.mockResolvedValue([
			{ id: 'membership', userListId: listId, userListUserId: viewer, userId, withReplies: false, user: null, userList: null },
		]);
		setMember(initialMember);
		const subscriber = new EventEmitter();
		const sendMessageToWs = vi.fn();
		const noteEntityService = mock<NoteEntityService>();
		noteEntityService.withMyRenoteReaction.mockImplementation(async note => note);
		const hidingService = mock<NoteStreamingHidingService>();
		hidingService.filter.mockImplementation(async note => note);
		const request = {
			id: 'channel',
			connection: {
				user: { id: viewer },
				subscriber,
				sendMessageToWs,
				userIdsWhoMeMuting: new Set(),
				userIdsWhoMeMutingRenotes: new Set(),
				userIdsWhoBlockingMe: new Set(),
				userMutedInstances: new Set(),
				mutingChannels: new Set(),
			},
		} as unknown as ChannelRequest;
		const channel = new UserListChannel(lists, memberships, request, noteEntityService, hidingService);

		async function receiveNote(userId: string) {
			sendMessageToWs.mockClear();
			const note: Pick<Packed<'Note'>, 'id' | 'userId' | 'visibility'> = { id: `note-by-${userId}`, userId, visibility: 'public' };
			await Promise.all(subscriber.listeners('notesStream').map(listener => listener(note)));
			return sendMessageToWs.mock.calls;
		}

		return { channel, memberships, setMember, subscriber, receiveNote };
	}

	/**
	 * 接続時にDBが一度応答できなくても、旧版の再読込間隔である5秒後には既存メンバーの投稿が届く。
	 * この間にリストが変化しないため、再読込を促すメンバーシップ通知は発生しない。
	 */
	test('初回の読込に失敗しても5秒後にメンバーの投稿が届く', async () => {
		const { channel, memberships, receiveNote } = fixture();
		memberships.find.mockRejectedValueOnce(new Error('database temporarily unavailable'));

		try {
			expect(await channel.init({ listId })).toBe(true);
			await vi.advanceTimersByTimeAsync(5000);

			expect(await receiveNote(initialMember)).toEqual([
				['channel', { id: 'channel', type: 'note', body: expect.objectContaining({ userId: initialMember }) }],
			]);
		} finally {
			channel.dispose();
		}
	});

	/**
	 * リストの現在のメンバーだけが投稿の配信対象になる。
	 * 通知の未着、または通知時のDB障害があっても、旧版と同じ5秒でDB上の変更を反映する。
	 */
	test.each([
		['通知時の読込に失敗した場合', true],
		['通知が届かない場合', false],
	] as const)('%sも5秒後に最新のメンバーに切り替わる', async (_scenario, notify) => {
		const { channel, memberships, setMember, subscriber, receiveNote } = fixture();

		try {
			expect(await channel.init({ listId })).toBe(true);
			expect(await receiveNote(initialMember)).toHaveLength(1);

			setMember(currentMember);
			if (notify) {
				memberships.find.mockRejectedValueOnce(new Error('database temporarily unavailable'));
				subscriber.emit(listEvent, { type: 'internalMembershipUpdated', body: null });
				expect(memberships.find).toHaveBeenCalledTimes(2);
			}
			await vi.advanceTimersByTimeAsync(5000);

			expect(await receiveNote(currentMember)).toHaveLength(1);
			expect(await receiveNote(initialMember)).toHaveLength(0);
		} finally {
			channel.dispose();
		}
	});

	/** 削除されたリストや切断済みの配信先には、通知が遅れて到着しても再読込や配信を行わない。 */
	test.each(['リスト削除', 'チャンネル切断'])('%sの後はメンバーを読み直さず投稿も配信しない', async scenario => {
		const { channel, memberships, subscriber, receiveNote } = fixture();

		try {
			expect(await channel.init({ listId })).toBe(true);
			expect(await receiveNote(initialMember)).toHaveLength(1);
			memberships.find.mockClear();

			if (scenario === 'リスト削除') {
				subscriber.emit(listEvent, { type: 'internalListDeleted' });
			} else {
				channel.dispose();
			}
			subscriber.emit(listEvent, { type: 'internalMembershipUpdated', body: null });
			await vi.advanceTimersByTimeAsync(10000);

			expect(memberships.find).not.toHaveBeenCalled();
			expect(await receiveNote(initialMember)).toHaveLength(0);
		} finally {
			channel.dispose();
		}
	});
});
