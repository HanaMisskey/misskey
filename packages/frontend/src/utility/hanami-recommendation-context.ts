import type { HanamiDisplayEvent } from '@/utility/hanami-impressions.js';
import { $i } from '@/i.js';
import { miLocalStorage } from '@/local-storage.js';

type Source = { event: HanamiDisplayEvent; authorId: string; accountId: string; expiresAt: number };
const lifetimeMs = 30 * 60_000;
const sources = new Map<string, Source>();
let lastStored: string | null | undefined;

const sourceKey = (accountId: string, token: string) => JSON.stringify([accountId, token]);
const isId = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

function parseSource(value: unknown, now: number): Source | undefined {
	if (typeof value !== 'object' || value == null) return;
	const record = value as Partial<Source>;
	const event = record.event;
	if (!event || !isId(event.eventId) || event.eventId.length > 128 || !isId(event.snapshotId) || !isId(event.entryId) || !isId(event.noteId)
		|| !isId(record.authorId) || !isId(record.accountId) || typeof record.expiresAt !== 'number' || !Number.isSafeInteger(record.expiresAt)
		|| record.expiresAt <= now || record.expiresAt > now + lifetimeMs) return;
	return {
		event: { eventId: event.eventId, snapshotId: event.snapshotId, entryId: event.entryId, noteId: event.noteId },
		authorId: record.authorId, accountId: record.accountId, expiresAt: record.expiresAt,
	};
}

function boundSources(now: number) {
	for (const [id, value] of sources) if (value.expiresAt <= now || value.expiresAt > now + lifetimeMs) sources.delete(id);
	if (sources.size > 1000) {
		const oldest = [...sources.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt).slice(0, sources.size - 1000);
		for (const [id] of oldest) sources.delete(id);
	}
}

function syncSources() {
	const now = Date.now();
	try {
		const stored = miLocalStorage.getItem('hanamiRecommendationContexts');
		if (stored !== lastStored) {
			lastStored = stored;
			const parsed: unknown = stored == null ? undefined : JSON.parse(stored);
			if (typeof parsed === 'object' && parsed != null && 'version' in parsed && parsed.version === 1 && 'sources' in parsed && Array.isArray(parsed.sources)) {
				for (const item of parsed.sources) {
					const value = parseSource(item, now);
					if (value) {
						const key = sourceKey(value.accountId, value.event.eventId);
						if (!sources.has(key)) sources.set(key, value);
					}
				}
			}
		}
	} catch {
		// ブラウザの保存拒否や壊れた補助文脈で、ノート表示と既存操作まで失敗させない。
	}
	boundSources(now);
}

function saveSources() {
	try {
		const stored = JSON.stringify({ version: 1, sources: [...sources.values()] });
		miLocalStorage.setItem('hanamiRecommendationContexts', stored);
		lastStored = stored;
	} catch {
		// 保存を必須にすると、同じdocumentで登録した文脈からの操作も保存拒否で失われる。
	}
}

function source(token: string | undefined) {
	if (token == null || !$i) return;
	syncSources();
	return sources.get(sourceKey($i.id, token));
}

export function withHanamiRecommendation<T extends { id: string; userId: string; user: { id: string } }>(note: T, event: HanamiDisplayEvent): T & { recommendationEvent: HanamiDisplayEvent } {
	if ($i && !source(event.eventId) && event.noteId === note.id && note.userId === note.user.id) {
		const now = Date.now();
		const value = parseSource({ event, authorId: note.userId, accountId: $i.id, expiresAt: now + lifetimeMs }, now);
		if (value) {
			sources.set(sourceKey(value.accountId, event.eventId), value);
			boundSources(now);
			saveSources();
		}
	}
	return { ...note, recommendationEvent: event, user: { ...note.user, hanamiRecommendation: event.eventId } };
}

export function getHanamiNoteContext(note: { id: string; recommendationEvent?: HanamiDisplayEvent }): HanamiDisplayEvent | undefined {
	const event = source(note.recommendationEvent?.eventId)?.event;
	return event?.noteId === note.id ? event : undefined;
}

export function getHanamiUserContext(user: { id?: string; hanamiRecommendation?: string }): HanamiDisplayEvent | undefined {
	return user.id ? hanamiContextForUser(user.hanamiRecommendation, user.id) : undefined;
}

export function hanamiContextForNote(token: string | undefined, noteId: string): HanamiDisplayEvent | undefined {
	const event = source(token)?.event;
	return event?.noteId === noteId ? event : undefined;
}

export function hanamiContextForUser(token: string | undefined, userId: string): HanamiDisplayEvent | undefined {
	const value = source(token);
	return value?.authorId === userId ? value.event : undefined;
}

export function hanamiNavigationPath(path: string, event: HanamiDisplayEvent | undefined): string {
	return event ? `${path}?hanami=${encodeURIComponent(event.eventId)}` : path;
}
