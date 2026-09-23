/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { FileInfoService } from '@/core/FileInfoService.js';
import { SensitiveMediaDetectionService, type Prediction } from '@/core/SensitiveMediaDetectionService.js';
import { LoggerService } from '@/core/LoggerService.js';
import type Logger from '@/logger.js';

/**
 * Oracle: sensitive-detector 842549b3174ba0caa5ea8368869a704f814d7459 の
 * docs/api-detect-images.md と nsfw-model/README.md。
 * 既存方針の出典: Misskey 56d13cb3d46435eae3e0d7cb097a5933ab252eac の
 * packages/backend/src/core/FileInfoService.ts。
 * 期待画像にもresizeやrotateを使うと同じ誤りを共有するため、入力画素と期待値を手で定める。
 */
describe('FileInfoService sensitive-detector の二分類契約', () => {
	const detector = mockDeep<SensitiveMediaDetectionService>();
	const logger = mockDeep<LoggerService>();
	const fileLogger = mockDeep<Logger>();
	fileLogger.createSubLogger.mockReturnValue(fileLogger);
	logger.getLogger.mockReturnValue(fileLogger);
	const service = new FileInfoService(detector, logger);
	let directory: string;

	const prediction = (nsfw: number): Prediction[] => [
		{ className: 'safe', probability: 1 - nsfw },
		{ className: 'nsfw', probability: nsfw },
	];

	beforeAll(async () => {
		directory = await mkdtemp(join(tmpdir(), 'misskey-sensitive-contract-'));
	});

	beforeEach(() => {
		detector.detectSensitive.mockReset().mockResolvedValue(prediction(0.1));
		detector.detectSensitiveMany.mockReset().mockResolvedValue([
			prediction(0.1), prediction(0.1),
		]);
	});

	afterAll(async () => {
		if (directory) await rm(directory, { recursive: true, force: true });
	});

	/**
	 * Oracle: 768→384 の半画素位置で Catmull–Rom を縮小率2に合わせて拡げた離散重みを使うと、
	 * 64→192 の段差に対する隣側の重みは 17/256。
	 * 64 + (192−64)×17/256 = 72.5、192 − (192−64)×17/256 = 183.5。
	 * uint8 への丸めで境界2画素は73、184になる。
	 */
	async function expectCubicEdge(png: Buffer): Promise<void> {
		expect(await sharp(png).metadata()).toMatchObject({ format: 'png', width: 384, height: 384, hasAlpha: false });
		const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
		expect(data[(192 * info.width + 191) * info.channels]).toBe(73);
		expect(data[(192 * info.width + 192) * info.channels]).toBe(184);
	}

	describe('静止画の正規化（実sharp）', () => {
		let rotatedPath: string;
		let edgePath: string;
		let exifEdgePath: string;

		beforeAll(async () => {
			rotatedPath = join(directory, 'rotated.png');
			edgePath = join(directory, 'edge.png');
			exifEdgePath = join(directory, 'exif-edge.png');
			const edge = Buffer.alloc(768 * 384 * 3);
			const stripes = Buffer.alloc(768 * 384 * 4);
			for (let y = 0; y < 384; y++) {
				for (let x = 0; x < 768; x++) {
					edge.fill(x < 384 ? 64 : 192, (y * 768 + x) * 3, (y * 768 + x + 1) * 3);
					const color = x < 128 ? [255, 0, 0, 255] : x >= 640 ? [0, 0, 255, 255] : [0, 255, 0, 0];
					stripes.set(color, (y * 768 + x) * 4);
				}
			}
			await sharp(edge, { raw: { width: 768, height: 384, channels: 3 } }).png().toFile(edgePath);
			await sharp(stripes, { raw: { width: 768, height: 384, channels: 4 } })
				.withMetadata({ orientation: 6 }).png().toFile(rotatedPath);
			const compressedEdge = Buffer.alloc(1152 * 1152 * 3);
			for (let y = 0; y < 1152; y++) {
				compressedEdge.fill(64, y * 1152 * 3, (y * 1152 + 576) * 3);
				compressedEdge.fill(192, (y * 1152 + 576) * 3, (y + 1) * 1152 * 3);
			}
			for (const format of ['jpeg', 'webp'] as const) {
				const encoded = await sharp(compressedEdge, { raw: { width: 1152, height: 1152, channels: 3 } })
					.toFormat(format, format === 'jpeg' ? { quality: 100, chromaSubsampling: '4:4:4' } : { lossless: true })
					.toFile(join(directory, `edge.${format}`));
				expect([encoded.width, encoded.height]).toEqual([1152, 1152]);
				// 圧縮誤差を補間の誤りと取り違えないよう、原寸の画素が保持されるfixtureだけを使う。
				const decoded = await sharp(join(directory, `edge.${format}`)).raw().toBuffer();
				expect(decoded.equals(compressedEdge)).toBe(true);
			}
			await sharp(edge, { raw: { width: 768, height: 384, channels: 3 } })
				.withMetadata({ orientation: 8 }).png().toFile(exifEdgePath);
		});

		test('静止画を EXIF 回転し、透過をグレーで埋め、端を切らずに 384×384 PNG にする', async () => {
			await service.getFileInfo(rotatedPath, { skipSensitiveDetection: false });
			expect(detector.detectSensitive).toHaveBeenCalledTimes(1);
			const png = detector.detectSensitive.mock.calls[0][0];
			expect(await sharp(png).metadata()).toMatchObject({ format: 'png', width: 384, height: 384, hasAlpha: false });
			const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
			const pixel = (x: number, y: number) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)];
			expect(pixel(192, 16)).toEqual([255, 0, 0]);
			expect(pixel(192, 192)).toEqual([119, 119, 119]);
			expect(pixel(192, 368)).toEqual([0, 0, 255]);
		});

		/**
		 * Oracle: EXIF8は (x,y)→(y,767−x) なので、上192/下64の段差になる。
		 * Catmull–Romの隣側の寄与17/256から、境界は192−128×17/256=183.5と
		 * 64+128×17/256=72.5。uint8へ丸めた絶対値184、73を使う。
		 */
		test('EXIF8で回転した段差を Catmull–Rom で補間すると境界画素が184と73になる', async () => {
			const info = await service.getFileInfo(exifEdgePath, { skipSensitiveDetection: false });
			expect(info.warnings).toEqual([]);
			expect(detector.detectSensitive).toHaveBeenCalledTimes(1);
			const png = detector.detectSensitive.mock.calls[0][0];
			expect(await sharp(png).metadata()).toMatchObject({ format: 'png', width: 384, height: 384, channels: 3, hasAlpha: false });
			const pixels = await sharp(png).raw().toBuffer();
			const upper = (191 * 384 + 192) * 3;
			const lower = (192 * 384 + 192) * 3;
			expect([...pixels.subarray(upper, upper + 3)]).toEqual([184, 184, 184]);
			expect([...pixels.subarray(lower, lower + 3)]).toEqual([73, 73, 73]);
		});

		test('静止画を Catmull–Rom で直接リサイズする', async () => {
			await service.getFileInfo(edgePath, { skipSensitiveDetection: false });
			expect(detector.detectSensitive).toHaveBeenCalledTimes(1);
			await expectCubicEdge(detector.detectSensitive.mock.calls[0][0]);
		});

		/**
		 * Oracle: 1152→384、出力x=191の中心は入力x=574。段差x=576以降の
		 * Catmull–Rom の重みの和は (1/3 − 2/27 − 1/27)/3 = 2/27。
		 * 64 + (192−64)×2/27 ≈ 73.48 をuint8へ丸めると73。
		 * 一方の辺が384のままではJPEGの縮小デコードが起動しないため、両辺を1152にする。
		 */
		test.each(['jpeg', 'webp'])('%s の縮小デコードで Catmull–Rom の画素を置き換えない', async (format) => {
			const info = await service.getFileInfo(join(directory, `edge.${format}`), { skipSensitiveDetection: false });
			expect(info.warnings).toEqual([]);
			expect(detector.detectSensitive).toHaveBeenCalledTimes(1);
			const png = detector.detectSensitive.mock.calls[0][0];
			expect(await sharp(png).metadata()).toMatchObject({ format: 'png', width: 384, height: 384, channels: 3, hasAlpha: false });
			const pixels = await sharp(png).raw().toBuffer();
			expect(pixels[(192 * 384 + 191) * 3]).toBe(73);
		});
	});

	describe('nsfwの判定', () => {
		let imagePath: string;

		beforeAll(async () => {
			imagePath = join(directory, 'judgment.png');
			await sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 64, g: 64, b: 64 } } })
				.png().toFile(imagePath);
		});

		test.each([
			{ nsfw: 0.69, sensitive: false },
			{ nsfw: 0.7, sensitive: false },
			{ nsfw: 0.71, sensitive: true },
		])('nsfw=$nsfw を閾値0.7で判定すると sensitive=$sensitive', async ({ nsfw, sensitive }) => {
			detector.detectSensitive.mockResolvedValue(prediction(nsfw));
			const info = await service.getFileInfo(imagePath, { skipSensitiveDetection: false, sensitiveThreshold: 0.7 });
			expect(info.warnings).toEqual([]);
			expect(detector.detectSensitive).toHaveBeenCalledTimes(1);
			expect(info.sensitive).toBe(sensitive);
		});

		test('nsfw が高くても Porn 分類を推定しない', async () => {
			detector.detectSensitive.mockResolvedValue(prediction(0.99));
			const info = await service.getFileInfo(imagePath, { skipSensitiveDetection: false, sensitiveThresholdForPorn: 0.3 });
			expect(info.warnings).toEqual([]);
			expect(detector.detectSensitive).toHaveBeenCalledTimes(1);
			expect(info).toMatchObject({ sensitive: true, porn: false });
		});
	});

	describe('動画の正規化と判定（実sharp・ffmpeg）', () => {
		let videoPath: string;

		beforeAll(async () => {
			const edgePath = join(directory, 'video-edge.png');
			videoPath = join(directory, 'frames.mkv');
			const edge = Buffer.alloc(768 * 384 * 3);
			for (let y = 0; y < 384; y++) {
				edge.fill(64, y * 768 * 3, (y * 768 + 384) * 3);
				edge.fill(192, (y * 768 + 384) * 3, (y + 1) * 768 * 3);
			}
			await sharp(edge, { raw: { width: 768, height: 384, channels: 3 } }).png().toFile(edgePath);
			// 非可逆圧縮では補間の期待値に誤差が混ざるため、FFV1を使う。
			await promisify(execFile)('ffmpeg', [
				'-y', '-loop', '1', '-framerate', '1', '-i', edgePath,
				'-frames:v', '2', '-c:v', 'ffv1', '-pix_fmt', 'bgr0', videoPath,
			], { timeout: 10000 });
		});

		test('動画の各抽出フレームも Catmull–Rom で直接 384×384 PNG にする', async () => {
			const info = await service.getFileInfo(videoPath, { skipSensitiveDetection: false, enableSensitiveMediaDetectionForVideos: true });
			expect(info.warnings).toEqual([]);
			expect(detector.detectSensitiveMany).toHaveBeenCalledTimes(1);
			const frames = detector.detectSensitiveMany.mock.calls[0][0];
			expect(frames).toHaveLength(2);
			for (const frame of frames) await expectCubicEdge(frame);
		});

		test('動画の部分失敗は分母から除き、成功1フレームがセンシティブなら閾値0.7を満たす', async () => {
			detector.detectSensitiveMany.mockResolvedValue([prediction(0.9), null]);
			const info = await service.getFileInfo(videoPath, { skipSensitiveDetection: false, enableSensitiveMediaDetectionForVideos: true, sensitiveThreshold: 0.7 });
			expect(info.warnings).toEqual([]);
			expect(detector.detectSensitiveMany).toHaveBeenCalledTimes(1);
			expect(info).toMatchObject({ sensitive: true, porn: false });
		});

		test('動画の全フレームが失敗した場合はセンシティブにしない', async () => {
			detector.detectSensitiveMany.mockResolvedValue([null, null]);
			const info = await service.getFileInfo(videoPath, { skipSensitiveDetection: false, enableSensitiveMediaDetectionForVideos: true });
			expect(info.warnings).toEqual([]);
			expect(detector.detectSensitiveMany).toHaveBeenCalledTimes(1);
			expect(detector.detectSensitiveMany.mock.calls[0][0]).toHaveLength(2);
			expect(info).toMatchObject({ sensitive: false, porn: false });
		});
	});
});
