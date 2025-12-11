/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Redis from 'ioredis';

const deleteScript = `
if redis.call("get", KEYS[1]) == ARGV[1] then
	return redis.call("del", KEYS[1])
else
	return 0
end
`;

export async function acquireDistributedLock(
	redis: Redis.Redis,
	name: string,
	timeout: number,
	maxRetries: number,
	retryInterval: number,
): Promise<() => Promise<void>> {
	const lockKey = `lock:${name}`;
	const identifier = Math.random().toString(36).slice(2);

	let retries = 0;
	while (retries < maxRetries) {
		const result = await redis.set(lockKey, identifier, 'PX', timeout, 'NX');
		if (result === 'OK') {
			return async () => {
				await redis.eval(deleteScript, 1, lockKey, identifier);
			};
		}

		await new Promise(resolve => setTimeout(resolve, retryInterval));
		retries++;
	}

	throw new Error(`Failed to acquire lock ${name}`);
}

export function acquireApObjectLock(
	redis: Redis.Redis,
	uri: string,
): Promise<() => Promise<void>> {
	return acquireDistributedLock(redis, `ap-object:${uri}`, 30 * 1000, 50, 100);
}

export function acquireChartInsertLock(
	redis: Redis.Redis,
	name: string,
): Promise<() => Promise<void>> {
	return acquireDistributedLock(redis, `chart-insert:${name}`, 30 * 1000, 50, 500);
}
