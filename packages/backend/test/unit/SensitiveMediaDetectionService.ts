/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { MiMeta } from '@/models/_.js';
import type { HttpRequestService } from '@/core/HttpRequestService.js';
import type { LoggerService } from '@/core/LoggerService.js';
import { SensitiveMediaDetectionService, type Prediction } from '@/core/SensitiveMediaDetectionService.js';

const sendMock = vi.fn();

const DEFAULT_META = {
	sensitiveMediaDetectionApiUrl: 'http://localhost:3009' as string | null,
	sensitiveMediaDetectionApiKey: null as string | null,
	sensitiveMediaDetectionTimeout: 5000,
	sensitiveMediaDetectionMaxImagesPerRequest: 4,
	sensitiveMediaDetectionUseProxy: null as boolean | null,
};

function makeService(metaOverrides: Partial<typeof DEFAULT_META> = {}): SensitiveMediaDetectionService {
	const meta = { ...DEFAULT_META, ...metaOverrides } as unknown as MiMeta;
	const httpRequestService = { send: sendMock } as unknown as HttpRequestService;
	const loggerService = {
		getLogger: () => ({ warn: () => {}, error: () => {}, info: () => {} }),
	} as unknown as LoggerService;
	return new SensitiveMediaDetectionService(meta, httpRequestService, loggerService);
}

function prediction(nsfw = 0.01): Prediction[] {
	return [
		{ className: 'safe', probability: 1 - nsfw },
		{ className: 'nsfw', probability: nsfw },
	];
}

function okResponse(results: unknown[]) {
	return {
		ok: true,
		status: 200,
		statusText: 'OK',
		json: async () => ({ success: true, result: { results } }),
	};
}

const buf = (s: string) => Buffer.from(s);

/**
 * Oracle: sensitive-detector 842549b3174ba0caa5ea8368869a704f814d7459 の
 * docs/api-detect-images.md。
 */
describe('SensitiveMediaDetectionService', () => {
	beforeEach(() => {
		sendMock.mockReset();
	});

	test('正常: 送信順を保った予測値配列を返す', async () => {
		sendMock.mockResolvedValue(okResponse([
			{ success: true, predictions: prediction() },
			{ success: true, predictions: prediction(0.8) },
		]));
		const svc = makeService();
		const res = await svc.detectSensitiveMany([buf('a'), buf('b')]);
		expect(res).toEqual([
			prediction(),
			prediction(0.8),
		]);
		expect(sendMock).toHaveBeenCalledTimes(1);
		expect(sendMock.mock.calls[0][0]).toBe('http://localhost:3009/v1/detect-images');
	});

	test('外部サービス: HttpRequestService を使用する', async () => {
		sendMock.mockResolvedValue(okResponse([{ success: true, predictions: prediction() }]));
		const svc = makeService({ sensitiveMediaDetectionApiUrl: 'https://detector.example.com' });

		await svc.detectSensitiveMany([buf('a')]);

		expect(sendMock).toHaveBeenCalledWith('https://detector.example.com/v1/detect-images', {
			method: 'POST',
			headers: {},
			body: expect.any(FormData),
			timeout: 5000,
			bypassProxy: false,
			isLocalAddressAllowed: true,
		}, {
			throwErrorWhenResponseNotOk: false,
		});
	});

	/**
	 * Oracle: S3 と同じ管理者指定サービスの通信契約。未指定は既存 Proxy 経路を維持し、
	 * 明示した false のときだけ Proxy を回避する。内部 Service のアドレスは許可する。
	 */
	test.each([
		{ useProxy: null, bypassProxy: false },
		{ useProxy: true, bypassProxy: false },
		{ useProxy: false, bypassProxy: true },
	])('Proxy 設定 $useProxy で管理者の接続方式を採用する', async ({ useProxy, bypassProxy }) => {
		sendMock.mockResolvedValue(okResponse([{ success: true, predictions: prediction() }]));
		await makeService({ sensitiveMediaDetectionUseProxy: useProxy }).detectSensitive(buf('a'));
		expect(sendMock.mock.calls[0][1]).toMatchObject({ bypassProxy, isLocalAddressAllowed: true });
	});

	test('detectSensitive: 単一画像はバッチの先頭を返す', async () => {
		sendMock.mockResolvedValue(okResponse([{ success: true, predictions: prediction() }]));
		const svc = makeService();
		const res = await svc.detectSensitive(buf('a'));
		expect(res).toEqual(prediction());
	});

	test('部分失敗: 失敗パーツのみ null になる', async () => {
		sendMock.mockResolvedValue(okResponse([
			{ success: true, predictions: prediction() },
			{ success: false, error: { code: 'IMAGE_DECODE_FAILED', message: 'x' } },
		]));
		const svc = makeService();
		const res = await svc.detectSensitiveMany([buf('a'), buf('b')]);
		expect(res[0]).toEqual(prediction());
		expect(res[1]).toBeNull();
	});

	test('非200: チャンク全件 null（例外を投げない）', async () => {
		sendMock.mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable', json: async () => ({}) });
		const svc = makeService();
		const res = await svc.detectSensitiveMany([buf('a'), buf('b')]);
		expect(res).toEqual([null, null]);
	});

	test('通信エラー: チャンク全件 null（例外を投げない）', async () => {
		sendMock.mockRejectedValue(new Error('network down'));
		const svc = makeService();
		const res = await svc.detectSensitiveMany([buf('a')]);
		expect(res).toEqual([null]);
	});

	test('接続先未設定: HTTP を叩かず全件 null', async () => {
		const svc = makeService({ sensitiveMediaDetectionApiUrl: null });
		const res = await svc.detectSensitiveMany([buf('a'), buf('b')]);
		expect(res).toEqual([null, null]);
		expect(sendMock).not.toHaveBeenCalled();
	});

	test('チャンク分割: 各チャンクの画像と結果の順序を保つ', async () => {
		sendMock
			.mockResolvedValueOnce(okResponse([
				{ success: true, predictions: prediction(0.1) },
				{ success: true, predictions: prediction(0.2) },
			]))
			.mockResolvedValueOnce(okResponse([
				{ success: true, predictions: prediction(0.3) },
				{ success: true, predictions: prediction(0.4) },
			]))
			.mockResolvedValueOnce(okResponse([{ success: true, predictions: prediction(0.5) }]));
		const svc = makeService({ sensitiveMediaDetectionMaxImagesPerRequest: 2 });
		const res = await svc.detectSensitiveMany([buf('a'), buf('b'), buf('c'), buf('d'), buf('e')]);
		expect(sendMock).toHaveBeenCalledTimes(3);
		const sentImages = await Promise.all(sendMock.mock.calls.map(async ([, request]) => {
			const form = (request as { body: FormData }).body;
			return Promise.all([...form.values()].map(part => (part as File).text()));
		}));
		expect(sentImages).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
		expect(res).toEqual([prediction(0.1), prediction(0.2), prediction(0.3), prediction(0.4), prediction(0.5)]);
	});

	test('APIキー設定時のみ Authorization: Bearer を付与する', async () => {
		sendMock.mockResolvedValue(okResponse([{ success: true, predictions: prediction() }]));

		const withKey = makeService({ sensitiveMediaDetectionApiKey: 'secret' });
		await withKey.detectSensitiveMany([buf('a')]);
		const withKeyHeaders = (sendMock.mock.calls[0][1] as { headers: Record<string, string> }).headers;
		expect(withKeyHeaders.Authorization).toBe('Bearer secret');

		sendMock.mockClear();
		sendMock.mockResolvedValue(okResponse([{ success: true, predictions: prediction() }]));
		const withoutKey = makeService();
		await withoutKey.detectSensitiveMany([buf('a')]);
		const withoutKeyHeaders = (sendMock.mock.calls[0][1] as { headers: Record<string, string> }).headers;
		expect(withoutKeyHeaders.Authorization).toBeUndefined();
	});

	test('multipart の各画像を PNG として送信順に保持し、boundary を手動設定しない', async () => {
		sendMock.mockResolvedValue(okResponse([
			{ success: true, predictions: prediction(0.1) },
			{ success: true, predictions: prediction(0.9) },
		]));
		await makeService().detectSensitiveMany([buf('first-png'), buf('second-png')]);
		const request = sendMock.mock.calls[0][1] as { body: FormData; headers: Record<string, string> };
		const parts = [...request.body.values()] as File[];
		expect(parts.map(part => part.type)).toEqual(['image/png', 'image/png']);
		expect(await Promise.all(parts.map(part => part.text()))).toEqual(['first-png', 'second-png']);
		expect(Object.keys(request.headers).some(name => name.toLowerCase() === 'content-type')).toBe(false);
	});

	test.each([1, 3])('2画像に対し結果が%i件なら順序対応を保証できないチャンク全体を検出不能にする', async (count) => {
		/** 件数不一致では欠落・追加位置を確定できないため、返された結果も別画像へ割り当てられない。 */
		sendMock.mockResolvedValue(okResponse(Array.from({ length: count }, () => ({ success: true, predictions: prediction() }))));
		expect(await makeService().detectSensitiveMany([buf('a'), buf('b')])).toEqual([null, null]);
	});

	test.each([
		{ name: '旧モデルのクラス', predictions: [{ className: 'Neutral', probability: 1 }] },
		{ name: 'nsfw 欠落', predictions: [{ className: 'safe', probability: 1 }] },
		{ name: 'safe 欠落', predictions: [{ className: 'nsfw', probability: 1 }] },
		{ name: 'nsfw 重複', predictions: [{ className: 'nsfw', probability: 0.8 }, { className: 'nsfw', probability: 0.2 }] },
		{ name: '負の nsfw', predictions: [{ className: 'safe', probability: 1 }, { className: 'nsfw', probability: -0.1 }] },
		{ name: '1を超える nsfw', predictions: [{ className: 'safe', probability: 0 }, { className: 'nsfw', probability: 1.1 }] },
		{ name: 'JSON の指数オーバーフロー', predictions: [{ className: 'safe', probability: 0 }, { className: 'nsfw', probability: JSON.parse('1e400') }] },
		{ name: '数値でない nsfw', predictions: [{ className: 'safe', probability: 0 }, { className: 'nsfw', probability: '0.9' }] },
	])('$name の成功パートだけを検出不能にして他の画像の結果を維持する', async ({ predictions }) => {
		sendMock.mockResolvedValue(okResponse([
			{ success: true, predictions: prediction(0.1) },
			{ success: true, predictions },
			{ success: true, predictions: prediction(0.9) },
		]));
		expect(await makeService().detectSensitiveMany([buf('a'), buf('b'), buf('c')]))
			.toEqual([prediction(0.1), null, prediction(0.9)]);
	});

	test('二分類確率の0と1を受け付け、クラスの配列順には依存しない', async () => {
		sendMock.mockResolvedValue(okResponse([
			{ success: true, predictions: prediction(0) },
			{ success: true, predictions: prediction(1).reverse() },
		]));
		expect(await makeService().detectSensitiveMany([buf('a'), buf('b')]))
			.toEqual([prediction(0), prediction(1).reverse()]);
	});
});
