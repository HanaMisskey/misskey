import { createHash, createHmac, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { LessThan } from 'typeorm';
import type { Config } from '@/config.js';
import { DI } from '@/di-symbols.js';
import { MiUser, MiFollowing, MiBlocking, MiMuting, MiRenoteMuting, MiUserProfile, MiMeta } from '@/models/_.js';
import { MiHanamiReadBarrier } from '@/models/HanamiReadBarrier.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { decodeHanamiPlatformResponse } from './HanamiPlatformResponse.js';
import type { HanamiPlatformContract, HanamiPlatformPath, HanamiPlatformRequest, HanamiPlatformResponse } from './HanamiPlatformWire.js';
import type { DataSource, EntityManager } from 'typeorm';

export type HanamiErrorCode = 'UNAVAILABLE' | 'REFRESH_REQUIRED' | 'INVALID_CURSOR' | 'INVALID_REQUEST' | 'EVENT_CONFLICT' | 'AUTHENTICATION_FAILED';
export class HanamiPlatformError extends Error {
	constructor(public readonly code: HanamiErrorCode = 'UNAVAILABLE') { super(code); }
}
export type HanamiAuthorization = {
	viewerId: string;
	followingIds: string[];
	blockingIds: string[];
	blockedByIds: string[];
	mutedIds: string[];
	renoteMutedIds: string[];
	mutedHosts: string[];
	blockedHosts: string[];
};
export function createHanamiAuthzVersion(input: HanamiAuthorization): string {
	const sorted = (values: string[]) => [...new Set(values)].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
	return createHash('sha256').update(JSON.stringify({
		viewerId: input.viewerId, followingIds: sorted(input.followingIds), blockingIds: sorted(input.blockingIds),
		blockedByIds: sorted(input.blockedByIds), mutedIds: sorted(input.mutedIds), renoteMutedIds: sorted(input.renoteMutedIds),
		mutedHosts: sorted(input.mutedHosts), blockedHosts: sorted(input.blockedHosts),
	}), 'utf8').digest('hex');
}

@Injectable()
export class HanamiPlatformClient {
	constructor(
		@Inject(DI.config) private config: Config,
		@Inject(DI.db) private db: DataSource,
		private httpRequestService: HttpRequestService,
	) {}

	private async authorization(manager: EntityManager, me: MiUser, now: number): Promise<HanamiAuthorization> {
		const viewer = await manager.findOneBy(MiUser, { id: me.id });
		if (me.host != null || !viewer || viewer.host !== null || viewer.isSuspended || viewer.isDeleted) throw new HanamiPlatformError();
		const [following, outgoing, incoming, mutes, renoteMutes, profile, meta] = await Promise.all([
			manager.findBy(MiFollowing, { followerId: me.id }), manager.findBy(MiBlocking, { blockerId: me.id }),
			manager.findBy(MiBlocking, { blockeeId: me.id }), manager.findBy(MiMuting, { muterId: me.id }),
			manager.findBy(MiRenoteMuting, { muterId: me.id }), manager.findOneBy(MiUserProfile, { userId: me.id }),
			manager.findOneBy(MiMeta, { id: 'x' }),
		]);
		if (!profile || !meta || !Array.isArray(profile.mutedInstances) || !Array.isArray(meta.blockedHosts)) throw new HanamiPlatformError();
		return {
			viewerId: me.id, followingIds: following.map(row => row.followeeId), blockingIds: outgoing.map(row => row.blockeeId),
			blockedByIds: incoming.map(row => row.blockerId), mutedIds: mutes.filter(row => row.expiresAt === null || Number(row.expiresAt) > now).map(row => row.muteeId),
			renoteMutedIds: renoteMutes.map(row => row.muteeId), mutedHosts: profile.mutedInstances, blockedHosts: meta.blockedHosts.map(host => host.toLowerCase()),
		};
	}

	public request(me: MiUser, path: '/internal/v1/recommendations', request: HanamiPlatformContract['/internal/v1/recommendations']['request']): Promise<HanamiPlatformContract['/internal/v1/recommendations']['response']>;
	public request(me: MiUser, path: '/internal/v1/recommendations/advance', request: HanamiPlatformContract['/internal/v1/recommendations/advance']['request']): Promise<HanamiPlatformContract['/internal/v1/recommendations/advance']['response']>;
	public request(me: MiUser, path: '/internal/v1/recommendations/validate', request: HanamiPlatformContract['/internal/v1/recommendations/validate']['request']): Promise<HanamiPlatformContract['/internal/v1/recommendations/validate']['response']>;
	public request(me: MiUser, path: '/internal/v1/feedback', request: HanamiPlatformContract['/internal/v1/feedback']['request']): Promise<HanamiPlatformContract['/internal/v1/feedback']['response']>;
	public request(me: MiUser, path: '/internal/v1/impressions', request: HanamiPlatformContract['/internal/v1/impressions']['request']): Promise<HanamiPlatformContract['/internal/v1/impressions']['response']>;
	public request(me: MiUser, path: '/internal/v1/observations', request: HanamiPlatformContract['/internal/v1/observations']['request']): Promise<HanamiPlatformContract['/internal/v1/observations']['response']>;
	public request(me: MiUser, path: '/internal/v1/search', request: HanamiPlatformContract['/internal/v1/search']['request']): Promise<HanamiPlatformContract['/internal/v1/search']['response']>;
	public async request(me: MiUser, path: HanamiPlatformPath, request: HanamiPlatformRequest): Promise<HanamiPlatformResponse> {
		try {
			const settings = this.config.hanamiPlatform;
			if (!settings || !settings.url || !settings.keyId || !settings.signingKey || !settings.sourceId || !Number.isSafeInteger(settings.generation) || settings.generation < 1) throw new HanamiPlatformError();
			const url = new URL(settings.url);
			if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new HanamiPlatformError();
			const timestamp = Date.now();
			const nonce = randomBytes(16).toString('hex');
			const authorization = await this.db.transaction('REPEATABLE READ', async manager => {
				const current = await this.authorization(manager, me, timestamp);
				await manager.insert(MiHanamiReadBarrier, { nonce, sourceId: settings.sourceId, generation: settings.generation, viewerId: me.id, createdAt: new Date(timestamp) });
				await manager.delete(MiHanamiReadBarrier, { createdAt: LessThan(new Date(timestamp - 3_600_000)) });
				return current;
			});
			const authzVersion = createHanamiAuthzVersion(authorization);
			const body = JSON.stringify({ viewer: { id: me.id, host: null }, barrier: { sourceId: settings.sourceId, generation: settings.generation, nonce }, authzVersion, serverPolicy: { blockedHosts: authorization.blockedHosts }, request });
			const signature = createHmac('sha256', Buffer.from(settings.signingKey, 'utf8')).update(`hanami-internal-v1\n${settings.keyId}\nPOST\n${path}\n${timestamp}\n${nonce}\n`, 'utf8').update(body, 'utf8').digest('hex');
			const response = await this.httpRequestService.send(new URL(path, url).href, {
				method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hanami-Key-Id': settings.keyId, 'X-Hanami-Timestamp': String(timestamp), 'X-Hanami-Nonce': nonce, 'X-Hanami-Signature': signature },
				body, timeout: 10000, size: 1024 * 1024, isLocalAddressAllowed: true,
			}, { throwErrorWhenResponseNotOk: false, validators: [] });
			const result: unknown = await response.json();
			if (!response.ok) {
				const error = result !== null && typeof result === 'object' && 'error' in result ? result.error : undefined;
				const code = error !== null && typeof error === 'object' && 'code' in error ? error.code : undefined;
				const forwardedCodes: readonly HanamiErrorCode[] = ['REFRESH_REQUIRED', 'INVALID_CURSOR', 'INVALID_REQUEST', 'EVENT_CONFLICT', 'AUTHENTICATION_FAILED'];
				throw new HanamiPlatformError(forwardedCodes.find(candidate => candidate === code) ?? 'UNAVAILABLE');
			}
			if (path === '/internal/v1/recommendations' || path === '/internal/v1/recommendations/advance' || path === '/internal/v1/recommendations/validate' || path === '/internal/v1/search') {
				const current = await this.db.transaction('REPEATABLE READ', manager => this.authorization(manager, me, Date.now()));
				if (createHanamiAuthzVersion(current) !== authzVersion) throw new HanamiPlatformError('REFRESH_REQUIRED');
			}
			return decodeHanamiPlatformResponse(path, result);
		} catch (error) {
			if (error instanceof HanamiPlatformError) throw error;
			throw new HanamiPlatformError();
		}
	}
}
