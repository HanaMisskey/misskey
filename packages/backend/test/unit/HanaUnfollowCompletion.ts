import { setImmediate } from 'node:timers/promises';
import { Test } from '@nestjs/testing';
import { describe, expect, test, vi } from 'vitest';
import { CacheService } from '@/core/CacheService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { UserFollowingService } from '@/core/UserFollowingService.js';
import { UserWebhookService } from '@/core/UserWebhookService.js';
import PerUserFollowingChart from '@/core/chart/charts/per-user-following.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { DI } from '@/di-symbols.js';
import { MiUser } from '@/models/User.js';

type CountField = 'followingCount' | 'followersCount';

function deferred() {
	return Promise.withResolvers<void>();
}

async function completionAtCheckpoint(operation: Promise<void>) {
	// I/Oの解放前に既存のPromise継続を流す。経過時間による成功判定はしない。
	return await Promise.race([
		operation.then(() => 'completed'),
		setImmediate().then(() => 'pending'),
	]);
}

async function setup(followExists = true) {
	const follower = new MiUser({ id: 'follower', host: null, uri: null, movedToUri: null, followingCount: 1, followersCount: 0 });
	const followee = new MiUser({ id: 'followee', host: null, uri: null, movedToUri: null, followingCount: 0, followersCount: 1 });
	const users = new Map([[follower.id, follower], [followee.id, followee]]);
	const updates = {
		followingCount: { started: deferred(), release: deferred(), finished: deferred() },
		followersCount: { started: deferred(), release: deferred(), finished: deferred() },
	};
	const following = { id: 'following', follower, followee };
	const followingsRepository = {
		findOne: vi.fn(async () => followExists ? following : null),
		delete: vi.fn(async () => {
			followExists = false;
			return { affected: 1 };
		}),
	};
	const usersRepository = {
		decrement: vi.fn(async ({ id }: { id: string }, field: CountField, amount: number) => {
			const update = updates[field];
			update.started.resolve();
			await update.release.promise;
			const user = users.get(id);
			if (!user) throw new Error(`Unknown user: ${id}`);
			user[field] -= amount;
			update.finished.resolve();
			return { affected: 1 };
		}),
	};
	const publishInternalEvent = vi.fn();
	const refresh = vi.fn();
	const app = await Test.createTestingModule({ providers: [UserFollowingService] })
		.useMocker(token => {
			if (token === DI.followingsRepository) return followingsRepository;
			if (token === DI.usersRepository) return usersRepository;
			if (token === CacheService) return { userFollowingsCache: { refresh } };
			if (token === GlobalEventService) return { publishInternalEvent, publishMainStream: vi.fn() };
			if (token === UserWebhookService) return { enqueueUserWebhook: vi.fn() };
			if (token === PerUserFollowingChart) return { update: vi.fn() };
			if (token === UserEntityService) {
				return {
					isLocalUser: (user: MiUser) => user.host === null,
					isRemoteUser: (user: MiUser) => user.host !== null,
					pack: vi.fn(async () => ({ id: followee.id })),
				};
			}
			return {};
		})
		.compile();

	return {
		app, follower, followee, updates, followingsRepository, usersRepository, publishInternalEvent, refresh,
		service: app.get(UserFollowingService),
		followingExists: () => followExists,
	};
}

/**
 * Oracle: following/delete.ts は public unfollow をawaitした後に応答する。
 * 既存E2E test/e2e/endpoints.ts の「following/delete > フォロー解除できる」は
 * 200応答後にfollowingCountとfollowersCountが0であることを要求する。
 * 1件の未移行ローカル利用者間のフォローを解除すると両件数は1から0になる。
 * repositoryのI/Oだけを保留し、公開unfollowと内部の件数更新は実処理を通す。
 * 各I/Oの開始・完了通知とイベントループのcheckpointで待機契約を観測するため、
 * 実DBの速度や固定sleepによる偶然の順序に依存しない単一プロセスのunit試験とする。
 */
describe('UserFollowingService.unfollow の件数更新完了', () => {
	test.each<CountField>(['followingCount', 'followersCount'])('%s が先に完了しても両件数の更新まで完了しない', async firstField => {
		const context = await setup();
		const { app, service, follower, followee, updates, usersRepository, followingsRepository } = context;
		const secondField = firstField === 'followingCount' ? 'followersCount' : 'followingCount';
		const operation = service.unfollow(follower, followee);

		try {
			await Promise.all([updates.followingCount.started.promise, updates.followersCount.started.promise]);
			expect(followingsRepository.delete).toHaveBeenCalledWith('following');
			expect(context.followingExists()).toBe(false);
			expect(usersRepository.decrement).toHaveBeenCalledWith({ id: follower.id }, 'followingCount', 1);
			expect(usersRepository.decrement).toHaveBeenCalledWith({ id: followee.id }, 'followersCount', 1);
			expect(follower.followingCount).toBe(1);
			expect(followee.followersCount).toBe(1);
			expect.soft(await completionAtCheckpoint(operation)).toBe('pending');

			updates[firstField].release.resolve();
			await updates[firstField].finished.promise;
			expect(follower.followingCount).toBe(firstField === 'followingCount' ? 0 : 1);
			expect(followee.followersCount).toBe(firstField === 'followersCount' ? 0 : 1);
			expect.soft(await completionAtCheckpoint(operation)).toBe('pending');

			updates[secondField].release.resolve();
			await updates[secondField].finished.promise;
			await expect(operation).resolves.toBeUndefined();
			expect(follower.followingCount).toBe(0);
			expect(followee.followersCount).toBe(0);
		} finally {
			updates.followingCount.release.resolve();
			updates.followersCount.release.resolve();
			await Promise.all([updates.followingCount.finished.promise, updates.followersCount.finished.promise, operation]);
			await app.close();
		}
	});

	/** Oracle: 公開unfollowは不存在のフォローをno-opとして扱う既存契約を維持する。 */
	test('フォローが存在しなければフォロー行と件数を変更せず正常終了する', async () => {
		const context = await setup(false);
		try {
			await expect(context.service.unfollow(context.follower, context.followee)).resolves.toBeUndefined();
			expect(context.followingsRepository.findOne).toHaveBeenCalled();
			expect(context.followingsRepository.delete).not.toHaveBeenCalled();
			expect(context.usersRepository.decrement).not.toHaveBeenCalled();
			expect(context.publishInternalEvent).not.toHaveBeenCalled();
			expect(context.refresh).not.toHaveBeenCalled();
			expect(context.follower.followingCount).toBe(1);
			expect(context.followee.followersCount).toBe(1);
		} finally {
			await context.app.close();
		}
	});
});
