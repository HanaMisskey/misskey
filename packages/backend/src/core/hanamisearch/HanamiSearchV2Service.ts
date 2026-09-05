/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import type { MiMeta, MiNote, MiUser, NotesRepository } from '@/models/_.js';
import type { Packed } from '@/misc/json-schema.js';
import { CacheService } from '@/core/CacheService.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { isUserRelated } from '@/misc/is-user-related.js';
import { isInstanceMuted } from '@/misc/is-instance-muted.js';
import { isMustRemove } from '@/misc/is-hidden-or-visibility-modified.js';
import { removeMutedUsersReactions } from '@/misc/reactions-mute.js';

type SearchOptions = {
	userId?: string | null;
	channelId?: string | null;
	host?: string | null;
	onlyWithFiles?: boolean;
};
type SearchPagination = { limit?: number; cursor?: string | null };
type SearchPage = { notes: Packed<'Note'>[]; nextCursor: string | null };
type SearchResponse = { hits: { id: string }[]; nextCursor?: string | null };

export class HanamiSearchV2Error extends Error {
	constructor(public readonly code: 'UNAVAILABLE' | 'INVALID_CURSOR' | 'INVALID_QUERY') {
		super(code === 'UNAVAILABLE' ? 'HanamiSearch v2 is unavailable.' : code === 'INVALID_CURSOR' ? 'Invalid HanamiSearch v2 cursor.' : 'Invalid HanamiSearch v2 query.');
	}
}

@Injectable()
export class HanamiSearchV2Service {
	constructor(
		@Inject(DI.config) private config: Config,
		@Inject(DI.notesRepository) private notesRepository: NotesRepository,
		@Inject(DI.meta) private meta: MiMeta,
		private noteEntityService: NoteEntityService,
		private cacheService: CacheService,
		private utilityService: UtilityService,
		private httpRequestService: HttpRequestService,
	) {}

	public async searchNote(q: string, me: MiUser | null, opts: SearchOptions, pagination: SearchPagination): Promise<SearchPage> {
		try {
			return await this.search(q, me, opts, pagination);
		} catch (error) {
			// 元の例外を添付すると、公開エラーへ接続先や応答内容が流出する。
			if (error instanceof HanamiSearchV2Error) throw error;
			throw new HanamiSearchV2Error('UNAVAILABLE');
		}
	}

	private async search(q: string, me: MiUser | null, opts: SearchOptions, pagination: SearchPagination): Promise<SearchPage> {
		const settings = this.config.hanamisearch;
		if (!settings?.apiKey) throw new HanamiSearchV2Error('UNAVAILABLE');
		const limit = pagination.limit ?? 10;
		const filter: string[] = [];
		if (opts.userId) filter.push(`userId = ${JSON.stringify(opts.userId)}`);
		if (opts.channelId) filter.push(`channelId = ${JSON.stringify(opts.channelId)}`);
		if (opts.host) filter.push(opts.host === '.' ? 'userHost IS NULL' : `userHost = ${JSON.stringify(opts.host)}`);
		if (opts.onlyWithFiles) filter.push('fileIds IS NOT NULL');
		const fingerprint = createHash('sha256').update(JSON.stringify([
			q, me?.id ?? null, filter, limit, settings.host, settings.port, settings.index,
		])).digest('hex');
		const key = createHash('sha256').update(settings.apiKey).digest();
		let cursor = pagination.cursor == null ? null : this.readCursor(pagination.cursor, key, fingerprint);
		const seenCursors = new Set<string>();
		if (cursor) seenCursors.add(cursor);
		const [muted, blocked, mutedInstances] = me ? await Promise.all([
			this.cacheService.userMutingsCache.fetch(me.id),
			this.cacheService.userBlockedCache.fetch(me.id),
			this.cacheService.userProfileCache.fetch(me.id).then(profile => new Set(profile.mutedInstances)),
		]) : [new Set<string>(), new Set<string>(), new Set<string>()];
		const url = `${settings.ssl ? 'https' : 'http'}://${settings.host}:${settings.port}/indexes/${encodeURIComponent(`${settings.index}---notes`)}/search`;

		for (let page = 0; page < 5; page++) {
			const response = await this.httpRequestService.send(url, {
				method: 'POST',
				headers: { Authorization: `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' },
				body: JSON.stringify({ q, hanamiSearchVersion: 'v2', sort: [], attributesToRetrieve: ['id'], filter: filter.join(' AND '), limit, ...(cursor ? { cursor } : {}) }),
				timeout: 10000,
				size: 1024 * 1024,
				isLocalAddressAllowed: true,
			}, { throwErrorWhenResponseNotOk: false, validators: [] });
			if (!response.ok) {
				if (response.status === 400) throw new HanamiSearchV2Error(cursor ? 'INVALID_CURSOR' : 'INVALID_QUERY');
				throw new HanamiSearchV2Error('UNAVAILABLE');
			}
			const result: unknown = await response.json();
			if (!this.isSearchResponse(result, limit)) throw new HanamiSearchV2Error('UNAVAILABLE');
			cursor = result.nextCursor ?? null;
			if (cursor && seenCursors.has(cursor)) throw new HanamiSearchV2Error('UNAVAILABLE');
			if (cursor) seenCursors.add(cursor);
			let notes: Packed<'Note'>[] = [];
			if (result.hits.length > 0) {
				const ids = [...new Set(result.hits.map(hit => hit.id))];
				const rows = await this.notesRepository.createQueryBuilder('note')
					.innerJoinAndSelect('note.user', 'user')
					.leftJoinAndSelect('note.reply', 'reply')
					.leftJoinAndSelect('note.renote', 'renote')
					.leftJoinAndSelect('reply.user', 'replyUser')
					.leftJoinAndSelect('renote.user', 'renoteUser')
					.where('note.id IN (:...noteIds)', { noteIds: ids })
					.getMany();
				const rowsById = new Map(rows.map(note => [note.id, note]));
				// ID順へ並べ直すと、HanamiSearch v2の検索順位を失う。
				const ordered = ids.flatMap(id => {
					const note = rowsById.get(id);
					return note && this.isAllowed(note, opts, muted, blocked, mutedInstances) ? [note] : [];
				});
				notes = (await this.noteEntityService.packMany(ordered, me, { withReactionAndUserPairCache: true }))
					.filter(note => !isMustRemove(note, 'home'));
				await Promise.all(notes.map(note => removeMutedUsersReactions(note, muted)));
			}
			if (notes.length > 0 || !cursor) return { notes, nextCursor: cursor ? this.writeCursor(cursor, key, fingerprint) : null };
		}
		// 空配列だけで終端にすると、除外されたページの後にある投稿へ到達できない。
		return { notes: [], nextCursor: cursor ? this.writeCursor(cursor, key, fingerprint) : null };
	}

	private isAllowed(note: MiNote, opts: SearchOptions, muted: Set<string>, blocked: Set<string>, mutedInstances: Set<string>): boolean {
		if (!['public', 'home'].includes(note.visibility)) return false;
		if (opts.userId && note.userId !== opts.userId) return false;
		if (opts.channelId && note.channelId !== opts.channelId) return false;
		if (opts.host && note.userHost !== (opts.host === '.' ? null : opts.host)) return false;
		if (opts.onlyWithFiles && note.fileIds.length === 0) return false;
		if (!note.user || note.user.isSuspended) return false;
		if (this.utilityService.isBlockedHost(this.meta.blockedHosts, note.userHost)) return false;
		if (note.userId !== note.renoteUserId && (note.renote?.user?.isSuspended || this.utilityService.isBlockedHost(this.meta.blockedHosts, note.renoteUserHost))) return false;
		if (note.userId !== note.replyUserId && (note.reply?.user?.isSuspended || this.utilityService.isBlockedHost(this.meta.blockedHosts, note.replyUserHost))) return false;
		if (isUserRelated(note, muted) || isUserRelated(note, blocked)) return false;
		if (isUserRelated(note.renote, muted) || isUserRelated(note.renote, blocked)) return false;
		return !isInstanceMuted(note, mutedInstances);
	}

	private isSearchResponse(value: unknown, limit: number): value is SearchResponse {
		if (value == null || typeof value !== 'object' || !('hits' in value)) return false;
		if (!Array.isArray(value.hits) || value.hits.length > limit) return false;
		if (!value.hits.every(hit => hit != null && typeof hit === 'object' && typeof hit.id === 'string' && /^[a-zA-Z0-9]{1,128}$/.test(hit.id))) return false;
		return !('nextCursor' in value) || value.nextCursor == null || (typeof value.nextCursor === 'string' && value.nextCursor.length > 0 && Buffer.byteLength(JSON.stringify(value.nextCursor)) <= 2048);
	}

	private writeCursor(cursor: string, key: Buffer, fingerprint: string): string {
		const iv = randomBytes(12);
		const cipher = createCipheriv('aes-256-gcm', key, iv);
		const encrypted = Buffer.concat([cipher.update(JSON.stringify({ cursor, fingerprint, expiresAt: Date.now() + 300000 })), cipher.final()]);
		return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
	}

	private readCursor(token: string, key: Buffer, fingerprint: string): string {
		try {
			if (token.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(token)) throw new Error();
			const bytes = Buffer.from(token, 'base64url');
			if (bytes.length <= 28 || bytes.toString('base64url') !== token) throw new Error();
			const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
			decipher.setAuthTag(bytes.subarray(12, 28));
			const value = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString());
			if (value.fingerprint !== fingerprint || typeof value.expiresAt !== 'number' || value.expiresAt <= Date.now() || typeof value.cursor !== 'string' || value.cursor.length === 0) throw new Error();
			return value.cursor;
		} catch {
			throw new HanamiSearchV2Error('INVALID_CURSOR');
		}
	}
}
