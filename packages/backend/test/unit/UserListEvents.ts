/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { UserListService } from '@/core/UserListService.js';
import DeleteList from '@/server/api/endpoints/users/lists/delete.js';
import type { ModuleRef } from '@nestjs/core';
import type { Redis } from 'ioredis';
import type { Config } from '@/config.js';
import type { IdService } from '@/core/IdService.js';
import type { QueueService } from '@/core/QueueService.js';
import type { SystemAccountService } from '@/core/SystemAccountService.js';
import type { UserEntityService } from '@/core/entities/UserEntityService.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiUserList, UserListMembershipsRepository, UserListsRepository } from '@/models/_.js';
import type { MiLocalUser } from '@/models/User.js';

/** 旧版Webは userListStream の全イベントを中継するため、新旧が混在してもそこから購読者に届くのは従来の公開イベントだけ。 */
test('旧版Webのリスト購読先へはメンバー追加・削除だけを送る', async () => {
	const redis = mock<Redis>();
	const events = new GlobalEventService(mock<Config>({ host: 'example.test' }), redis);
	const memberships = mock<UserListMembershipsRepository>();
	memberships.countBy.mockResolvedValue(0);
	const moduleRef = mock<ModuleRef>();
	moduleRef.get.mockReturnValue({ getUserPolicies: async () => ({ userEachUserListsLimit: 10 }) });
	const owner = mock<MiLocalUser>({ id: 'owner' });
	const member = mock<MiLocalUser>({ id: 'member' });
	const list = mock<MiUserList>({ id: 'list', userId: owner.id });
	const user: Packed<'UserLite'> = {
		id: member.id,
		username: 'member',
		name: null,
		host: null,
		avatarUrl: '/avatar.png',
		avatarBlurhash: null,
		avatarDecorations: [],
		emojis: {},
		onlineStatus: 'unknown',
	};
	const users = mock<UserEntityService>();
	users.pack.mockResolvedValue(user);
	users.isRemoteUser.mockReturnValue(false);
	const ids = mock<IdService>();
	ids.gen.mockReturnValue('membership');
	const lists = mock<UserListsRepository>();
	lists.findOneBy.mockResolvedValue(list);

	const service = new UserListService(moduleRef, redis, redis, memberships, users, ids, events, mock<QueueService>(), mock<SystemAccountService>());
	try {
		await service.onModuleInit();
		await service.addMember(member, list, owner);
		await service.removeMember(member, list);
		await new DeleteList(lists, events).exec({ listId: list.id }, owner, null);

		const messages = redis.publish.mock.calls.map(([, payload]) => JSON.parse(payload.toString()));
		expect(messages.filter(event => event.channel === 'userListStream:list').map(event => event.message)).toEqual([
			{ type: 'userAdded', body: user },
			{ type: 'userRemoved', body: user },
		]);
		expect(messages.filter(event => event.channel === 'internalUserListStream:list').map(event => event.message)).toEqual([
			{ type: 'internalMembershipUpdated', body: null },
			{ type: 'internalMembershipUpdated', body: null },
			{ type: 'internalListDeleted', body: null },
		]);
	} finally {
		service.dispose();
	}
});
