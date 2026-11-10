/// <reference types="vite/client" />
/** Composer rendering leaves are isolated; the actual text input, submit button, notes/create and observation delivery remain real. */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import { startHanamiWindow } from '../helpers/hanami-window.js';
import type * as Misskey from 'misskey-js';

const { request, alert, viewer } = vi.hoisted(() => ({
	request: vi.fn(), alert: vi.fn(), viewer: { id: 'alice', username: 'alice', avatarUrl: '', policies: {} },
}));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: request }));
vi.mock('@/utility/hanami-device-context.js', () => ({ captureHanamiDeviceContext: () => ({ deviceClass: 'desktop', viewportClass: 'wide', primaryPointer: 'fine' }) }));
vi.mock('@/os.js', () => ({ alert, confirm: async () => ({ canceled: false }), claimZIndex: () => 100 }));
vi.mock('@/i.js', () => ({ $i: viewer, ensureSignin: () => viewer, notesCount: 0, incNotesCount: vi.fn() }));
vi.mock('@/instance.js', () => ({ instance: { maxNoteTextLength: 3000 } }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { defaultNoteVisibility: 'public', defaultNoteLocalOnly: false }, commit: vi.fn() } }));
vi.mock('@/store.js', async () => {
	const { ref } = await import('vue');
	return { store: { s: { showPreview: false }, r: { tips: ref({ postForm: true }) }, set: vi.fn(), makeGetterSetter: () => ({ get: () => false, set: vi.fn() }) } };
});
vi.mock('@/local-storage.js', () => ({ miLocalStorage: { getItem: () => null, setItem: vi.fn() } }));
vi.mock('@/composables/use-uploader.js', async () => {
	const { ref } = await import('vue');
	return { useUploader: () => ({ uploading: ref(false), items: ref([]), readyForUpload: ref(true), allItemsUploaded: ref(true), events: { on: vi.fn() }, upload: vi.fn() }) };
});
vi.mock('@/plugin.js', () => ({ getPluginHandlers: () => [] }));
vi.mock('@/accounts.js', () => ({ getAccounts: async () => [], getAccountMenu: vi.fn() }));
vi.mock('@/utility/autocomplete.js', () => ({ Autocomplete: class {} }));
vi.mock('@/utility/drive.js', () => ({ chooseDriveFile: vi.fn(), chooseFileFromUrl: vi.fn() }));
vi.mock('@/utility/achievements.js', () => ({ claimAchievement: vi.fn() }));
vi.mock('@/utility/emoji-picker.js', () => ({ emojiPicker: {} }));
vi.mock('@/utility/mfm-function-picker.js', () => ({ mfmFunctionPicker: {} }));
vi.mock('@/utility/tour.js', () => ({ startTour: vi.fn() }));
vi.mock('@/tips.js', () => ({ closeTip: vi.fn() }));
vi.mock('@/components/MkNotePreview.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkNoteSimple.vue', () => ({ default: { props: ['note'], template: '<p>{{ note.text }}</p>' } }));
vi.mock('@/components/MkPostFormAttaches.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkPostForm.TextCounter.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkPollEditor.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkRippleEffect.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkInfo.vue', () => ({ default: { template: '<aside><slot/></aside>' } }));
vi.mock('@/i18n.js', async () => {
	const { default: raw } = await import('../../../../locales/ja-JP.yml?raw');
	const { load } = await import('js-yaml');
	const ts = load(raw) as Record<string, unknown>;
	const format = (value: unknown): unknown => typeof value === 'string'
		? (params: Record<string, unknown>) => value.replace(/\{([^}]+)\}/g, (_, name: string) => String(params[name]))
		: Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, format(item)]));
	return { i18n: { ts, tsx: format(ts) } };
});

import MkPostForm from '@/components/MkPostForm.vue';
import { withHanamiRecommendation } from '@/utility/hanami-recommendation-context.js';

type Kind = 'reply' | 'quote';
let sourceNumber = 0;

function note(id = 'recommended') {
	return { id, userId: 'bob', user: { id: 'bob', username: 'bob', host: null }, visibility: 'public', text: '推薦された投稿', files: [], fileIds: [], renoteId: null, replyId: null } as unknown as Misskey.entities.Note;
}

function recommended() {
	return withHanamiRecommendation(note(), { eventId: `post-display-${++sourceNumber}`, snapshotId: 'snapshot1', entryId: 'entry1', noteId: 'recommended' });
}

function created(kind: Kind) {
	return { ...note('created-evidence'), userId: 'alice', text: '私の応答', replyId: kind === 'reply' ? 'recommended' : null, renoteId: kind === 'quote' ? 'recommended' : null };
}

function apiImplementation() {
	const implementation = request.getMockImplementation();
	if (!implementation) throw new Error('API boundary is not initialized');
	return implementation;
}

function observations() {
	return request.mock.calls.filter(([route]) => route === 'hanami-impressions').flatMap(([, body]) => body.observations);
}

function mount(kind: Kind, source = recommended(), visibility: 'public' | 'specified' = 'public') {
	return render(MkPostForm, { props: { [kind === 'reply' ? 'reply' : 'renote']: source, initialVisibility: visibility, instant: true, autofocus: false }, global: { stubs: { MkAcct: true, MkEllipsis: true, I18n: true }, directives: { 'click-anime': {}, tooltip: {} } } });
}

async function settle(milliseconds = 0) {
	await nextTick();
	await vi.advanceTimersByTimeAsync(milliseconds);
	await nextTick();
}

async function submit(view: ReturnType<typeof mount>, text = 'これは私の応答です') {
	const input = view.container.querySelector('textarea[data-cy-post-form-text]');
	const button = view.container.querySelector('button[data-cy-open-post-form-submit]');
	if (!input || !button) throw new Error('The real composer controls did not render');
	await fireEvent.update(input, text);
	expect((button as HTMLButtonElement).disabled).toBe(false);
	await fireEvent.click(button);
	await settle();
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>(yes => { resolve = yes; });
	return { promise, resolve };
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-11-08T00:00:00.000Z'));
	vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-345);
	request.mockImplementation(async (route: string) => {
		if (route === 'hanami-impressions') return undefined;
		if (route === 'users/show') return note().user;
		throw new Error(`Unexpected API ${route}`);
	});
});
afterEach(async () => { cleanup(); await settle(1000); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.clearAllMocks(); });

/** Oracle: the interaction contract requires successful reply/quote creation with the created note ID as evidence, matching recommendation note context, and no events for failed/cancelled operations or DM. The actual composer executes notes/create and the shared v4 delivery; recommendation rendering and DB verification are separate integration scopes. */
describe('recommended reply and quote composer', () => {
	test.each(['reply', 'quote'] as const)('records %s after successful creation without waiting for observation delivery', async kind => {
		const result = deferred<{ createdNote: Misskey.entities.Note }>();
		const delivery = deferred<void>();
		const original = apiImplementation();
		request.mockImplementation((route, body) => route === 'notes/create' ? result.promise : route === 'hanami-impressions' ? delivery.promise : original(route, body));
		const view = mount(kind);
		await submit(view);
		expect(request).toHaveBeenCalledWith('notes/create', expect.objectContaining(kind === 'reply' ? { replyId: 'recommended' } : { renoteId: 'recommended' }), undefined);
		await settle(500);
		expect(observations()).toEqual([]);
		result.resolve({ createdNote: created(kind) });
		await settle(500);
		expect(view.emitted().posted).toHaveLength(1);
		expect(observations()).toEqual([{
			kind: 'action', action: kind, evidenceNoteId: 'created-evidence', noteId: 'recommended', snapshotId: 'snapshot1', entryId: 'entry1', eventId: expect.any(String),
			occurredAtMs: Date.parse('2026-11-08T00:00:00.500Z'), utcOffsetMinutes: 345,
			deviceContext: { deviceClass: 'desktop', viewportClass: 'wide', primaryPointer: 'fine' },
		}]);
		expect(request.mock.calls.filter(([route]) => route === 'hanami-impressions').map(([, body]) => body.version)).toEqual([4]);
		delivery.resolve();
		await settle();
	});

	test.each(['reply', 'quote'] as const)('failed %s creation produces no event and keeps the form available', async kind => {
		const original = apiImplementation();
		request.mockImplementation((route, body) => route === 'notes/create' ? Promise.reject(new Error('Creation rejected')) : original(route, body));
		const view = mount(kind);
		await submit(view);
		await settle(500);
		expect(view.emitted().postError).toHaveLength(1);
		expect(view.emitted().posted).toBeUndefined();
		expect((view.container.querySelector('[data-cy-open-post-form-submit]') as HTMLButtonElement).disabled).toBe(false);
		expect(observations()).toEqual([]);
	});

	test.each(['reply', 'quote'] as const)('closing a %s composer without submitting produces no event', async kind => {
		const view = mount(kind);
		const close = view.container.querySelector('header button');
		if (!close) throw new Error('Composer close button is missing');
		await fireEvent.click(close);
		await settle(500);
		expect(view.emitted().cancel).toHaveLength(1);
		expect(request.mock.calls.filter(([route]) => route === 'notes/create')).toHaveLength(0);
		expect(observations()).toEqual([]);
	});

	test.each(['ordinary', 'different-note', 'different-actor', 'different-target', 'direct-message'] as const)('does not attribute a submitted reply from %s', async reason => {
		let source = recommended();
		let result = created('reply');
		if (reason === 'ordinary') source = note() as typeof source;
		if (reason === 'different-note') source = { ...source, id: 'another-note' };
		if (reason === 'different-actor') result = { ...result, userId: 'charlie' };
		if (reason === 'different-target') result = { ...result, replyId: 'another-note' };
		if (reason === 'direct-message') result = { ...result, visibility: 'specified' };
		const original = apiImplementation();
		request.mockImplementation((route, body) => route === 'notes/create' ? Promise.resolve({ createdNote: result }) : original(route, body));
		const view = mount('reply', source, reason === 'direct-message' ? 'specified' : 'public');
		await submit(view);
		await settle(500);
		expect(view.emitted().posted).toHaveLength(1);
		expect(observations()).toEqual([]);
	});

	test('a pure renote submitted through the quote form is not a quote interaction', async () => {
		const original = apiImplementation();
		request.mockImplementation((route, body) => route === 'notes/create' ? Promise.resolve({ createdNote: { ...created('quote'), text: null, cw: null, files: [], fileIds: [], poll: null } }) : original(route, body));
		const view = mount('quote');
		await submit(view, '');
		await settle(500);
		expect(view.emitted().posted).toHaveLength(1);
		expect(observations()).toEqual([]);
	});
});

/** Oracle: addendum §8 and window-api §2. The actual composer starts pending work at notes/create, keeps successful posting UI, and never sends specified-post evidence. */
describe('composer observation-window completion', () => {
	beforeEach(() => {
		vi.spyOn(document, 'hasFocus').mockReturnValue(true);
		Object.defineProperty(document, 'hidden', { configurable: true, value: false });
		Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
	});
	afterEach(async () => { window.dispatchEvent(new Event('pagehide')); await settle(500); });
	const source = () => withHanamiRecommendation(note(), { eventId: `window-post-${++sourceNumber}`, snapshotId: `window-post-snapshot-${sourceNumber}`, entryId: 'entry1', noteId: 'recommended' });
	const closes = () => observations().filter(record => record.kind === 'window' && record.phase === 'close');

	test.each(['reply', 'quote'] as const)('keeps pending %s incomplete after late first success while preserving its ordinary action', async kind => {
		const response = deferred<{ createdNote: Misskey.entities.Note }>();
		const original = apiImplementation();
		request.mockImplementation((route, body) => route === 'notes/create' ? response.promise : original(route, body));
		const recommendedNote = source();
		startHanamiWindow(recommendedNote.recommendationEvent);
		const view = mount(kind, recommendedNote);
		await settle(59_000);
		await submit(view);
		await settle(2_000);
		response.resolve({ createdNote: created(kind) });
		await settle(500);
		expect(closes()).toEqual([expect.objectContaining({ complete: false })]);
		const action = observations().find(record => record.kind === 'action');
		expect(action).toMatchObject({ action: kind, evidenceNoteId: 'created-evidence' });
		expect(action).not.toHaveProperty('windowId');
		expect(view.emitted().posted).toHaveLength(1);
	});

	test.each([['reply', 'response'], ['reply', 'request'], ['quote', 'response'], ['quote', 'request']] as const)('successful specified %s from %s makes the window uncertain without disclosing evidence', async (kind, where) => {
		const original = apiImplementation();
		request.mockImplementation((route, body) => route === 'notes/create' ? Promise.resolve({ createdNote: { ...created(kind), visibility: where === 'response' ? 'specified' : 'public' } }) : original(route, body));
		const recommendedNote = source();
		startHanamiWindow(recommendedNote.recommendationEvent);
		const view = mount(kind, recommendedNote, where === 'request' ? 'specified' : 'public');
		await submit(view, 'PRIVATE_POST_BODY');
		await settle(60_500);
		expect(view.emitted().posted).toHaveLength(1);
		expect(closes()).toEqual([expect.objectContaining({ complete: false, pendingActions: 0 })]);
		expect(observations().filter(record => record.kind === 'action')).toEqual([]);
		for (const secret of ['PRIVATE_POST_BODY', 'created-evidence', 'evidenceNoteId', 'specified']) expect(JSON.stringify(observations())).not.toContain(secret);
	});

	test('public reply success remains attached, while merely editing another form creates no pending action', async () => {
		const original = apiImplementation();
		request.mockImplementation((route, body) => route === 'notes/create' ? Promise.resolve({ createdNote: created('reply') }) : original(route, body));
		const recommendedNote = source();
		startHanamiWindow(recommendedNote.recommendationEvent);
		const view = mount('reply', recommendedNote);
		await submit(view);
		mount('quote', recommendedNote);
		await settle(60_500);
		expect(closes()).toEqual([expect.objectContaining({ complete: true, pendingActions: 0 })]);
		expect(observations().find(record => record.kind === 'action')).toMatchObject({ action: 'reply', windowId: expect.any(String) });
	});
});
