import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import type { MiUser } from '@/models/User.js';
import { bindThis } from '@/decorators.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';

@Injectable()
export class BskMiAuthService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		private httpRequestService: HttpRequestService,
	) {
	}

	@bindThis
	public async createAuthSession(userId: MiUser['id']): Promise<string> {
		const sessionId = randomUUID();

		await this.redisClient.set(`bskAuthSession:${userId}`, sessionId, 'EX', 60 * 2); // 2m

		return sessionId;
	}

	@bindThis
	public async verifyAuthSession(userId: MiUser['id']): Promise<{ bskUserId: string; token: string; }> {
		const sessionId = await this.redisClient.get(`bskAuthSession:${userId}`);
		if (sessionId == null) {
			throw new IdentifiableError('83a41880-4ad3-4571-a499-3edc1b2b191d', 'Session not found');
		}

		const res = await this.httpRequestService.send(`https://${this.config.bskHost}/api/miauth/${sessionId}/check`, {
			method: 'POST',
			body: '{}',
			headers: {
				'Content-Type': 'application/json',
			},
			timeout: 3000,
		});

		if (!res.ok) {
			throw new IdentifiableError('93ab6634-16b3-46b4-9ffb-b2d3cf3d5190', 'Failed to verify session');
		}

		const data = await res.json().catch(() => null);

		if (
			data == null ||
			typeof data !== 'object' ||
			'token' in data === false ||
			typeof data.token !== 'string' ||
			'user' in data === false ||
			data.user == null ||
			typeof data.user !== 'object' ||
			'id' in data.user === false ||
			typeof data.user.id !== 'string'
		) {
			throw new IdentifiableError('93ab6634-16b3-46b4-9ffb-b2d3cf3d5190', 'Failed to verify session');
		}

		this.redisClient.del(`bskAuthSession:${userId}`);

		return {
			bskUserId: data.user.id,
			token: data.token,
		};
	}
}

