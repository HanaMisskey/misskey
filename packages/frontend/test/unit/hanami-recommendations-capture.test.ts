/* eslint-disable vue/one-component-per-file -- The parent and child are a test fixture for inherited capture configuration. */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { defineComponent, h, nextTick, provide } from 'vue';
import type { InjectionKey } from 'vue';
import type * as Misskey from 'misskey-js';

const { stream, api, state, listeners } = vi.hoisted(() => ({
	stream: { send: vi.fn(), on: vi.fn(), off: vi.fn() }, api: vi.fn(), state: { realtimeMode: true },
	listeners: new Map<string, (value: unknown) => void>(),
}));
vi.mock('@/stream.js', () => ({ useStream: () => stream }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: api }));
vi.mock('@/i.js', () => ({ $i: { id: 'alice' } }));
vi.mock('@/store.js', () => ({ store: { s: state } }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { pollingInterval: 3 } } }));
vi.mock('@/events.js', () => ({ globalEvents: { emit: vi.fn() } }));

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-10-31T00:00:00.000Z'));
	state.realtimeMode = true;
	Object.defineProperty(document, 'hidden', { configurable: true, value: false });
	stream.on.mockImplementation((name: string, listener: (value: unknown) => void) => listeners.set(name, listener));
	stream.off.mockImplementation((name: string) => listeners.delete(name));
	api.mockResolvedValue([{ id: 'note1', reactions: { '👍': 2 }, reactionEmojis: {} }]);
});
afterEach(() => {
	cleanup();
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.resetAllMocks();
	vi.resetModules();
	listeners.clear();
});

async function mountCapture(httpOnly: boolean | undefined, provided = false) {
	const { useNoteCapture, noteEvents } = await import('@/composables/use-note-capture.js');
	const { DI } = await import('@/di.js');
	let capture: ReturnType<typeof useNoteCapture> | undefined;
	const note = { id: 'note1', createdAt: new Date().toISOString(), reactions: {}, reactionCount: 0, reactionEmojis: {}, myReaction: null } as unknown as Misskey.entities.Note;
	const Child = defineComponent({ setup() {
		const options = { note, parentNote: null, mock: false, httpOnly };
		const noteCapture = useNoteCapture(options);
		capture = noteCapture;
		return () => h('p', `反応: ${noteCapture.$note.reactionCount}`);
	} });
	const Parent = defineComponent({ setup() {
		if (provided) provide((DI as typeof DI & { noteCaptureHttpOnly: InjectionKey<boolean> }).noteCaptureHttpOnly, true);
		return () => h('div', [h(Child)]);
	} });
	const view = render(Parent);
	return { ...view, get capture() {
		if (!capture) throw new Error('Capture fixture did not mount');
		return capture;
	}, noteEvents };
}

/** Oracle: recommendation cards retain reaction updates through the existing HTTP-only setting, including inherited settings for nested cards. Own actions and ordinary realtime updates must change the displayed reaction count. Transport call counts and subscription absence are not observable acceptance criteria. The real capture composable and Vue rendering execute; HTTP and incoming realtime events are external doubles. */
describe('recommendation card reaction state', () => {
	test('displays reaction counts returned through explicit HTTP-only capture', async () => {
		const f = await mountCapture(true);
		expect(f.getByText('反応: 0')).toBeTruthy();
		await vi.advanceTimersByTimeAsync(10_000);
		expect(f.getByText('反応: 2')).toBeTruthy();
		expect(f.capture.$note.reactions).toEqual({ '👍': 2 });
	});

	test('displays HTTP reaction updates when the parent provides the setting', async () => {
		const f = await mountCapture(undefined, true);
		expect(f.getByText('反応: 0')).toBeTruthy();
		await vi.advanceTimersByTimeAsync(10_000);
		expect(f.getByText('反応: 2')).toBeTruthy();
		expect(f.capture.$note.reactions).toEqual({ '👍': 2 });
	});

	test('displays incoming reaction updates on an ordinary realtime note', async () => {
		const f = await mountCapture(false);
		listeners.get('noteUpdated')?.({ type: 'reacted', id: 'note1', body: { userId: 'bob', reaction: '👍' } });
		await nextTick();
		expect(f.getByText('反応: 1')).toBeTruthy();
		expect(f.capture.$note.reactions).toEqual({ '👍': 1 });
	});

	test('displays own reaction and cancellation immediately', async () => {
		const f = await mountCapture(true);
		f.noteEvents.emit('reacted:note1', { userId: 'alice', reaction: '👍' });
		await nextTick();
		expect(f.capture.$note.myReaction).toBe('👍');
		expect(f.getByText('反応: 1')).toBeTruthy();
		f.noteEvents.emit('unreacted:note1', { userId: 'alice', reaction: '👍' });
		await nextTick();
		expect(f.capture.$note.myReaction).toBeNull();
		expect(f.getByText('反応: 0')).toBeTruthy();
	});
});
