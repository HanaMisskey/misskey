process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import * as crypto from 'crypto';
import { api, failedApiCall, signup, successfulApiCall, createMultipartSession, uploadPart, completeMultipart, abortMultipart, sendEnvUpdateRequest, sendEnvResetRequest } from '../utils.js';
import type * as misskey from 'misskey-js';

const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY;
const R2_SECRET_KEY = process.env.R2_SECRET_KEY;
const R2_BUCKET = process.env.R2_BUCKET;
const R2_STAGING_BUCKET = process.env.R2_STAGING_BUCKET;
const hasR2 = !!(R2_ENDPOINT && R2_ACCESS_KEY && R2_SECRET_KEY && R2_BUCKET);
const hasR2Staging = !!(hasR2 && R2_STAGING_BUCKET);

function generateRandomBlob(size: number): Blob {
	return new Blob([crypto.randomBytes(size)]);
}

describe('Multipart Upload', () => {
	let admin: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;

	beforeAll(async () => {
		admin = await signup({ username: 'admin' });
		bob = await signup({ username: 'bob' });
	}, 1000 * 60 * 2);

	describe('ローカルストレージ', () => {
		test('セッション作成 → 3パートアップロード → complete でファイルが作成される', async () => {
			const session = await successfulApiCall({
				endpoint: 'drive/files/multipart/create',
				parameters: { totalParts: 3, name: 'multipart-test.bin' },
				user: admin,
			});
			const sessionId = session.sessionId;

			const r1 = await uploadPart(admin, sessionId, 1, generateRandomBlob(1024));
			assert.strictEqual(r1.status, 200);
			assert.strictEqual(r1.body.partNumber, 1);
			assert.strictEqual(r1.body.done, false);

			await uploadPart(admin, sessionId, 2, generateRandomBlob(1024));

			const r3 = await uploadPart(admin, sessionId, 3, generateRandomBlob(1024));
			assert.strictEqual(r3.body.done, true);

			const file = await successfulApiCall({
				endpoint: 'drive/files/multipart/complete',
				parameters: { sessionId },
				user: admin,
			});
			assert.ok(file.id);
			assert.strictEqual(file.name, 'multipart-test.bin');
			assert.strictEqual(file.size, 3072);
		});

		test('他ユーザーのセッションにはアップロードできない', async () => {
			const session = await successfulApiCall({
				endpoint: 'drive/files/multipart/create',
				parameters: { totalParts: 1, name: 'secure.bin' },
				user: admin,
			});

			const res = await uploadPart(bob, session.sessionId, 1, generateRandomBlob(100));
			assert.strictEqual(res.status, 400);
			assert.strictEqual(res.body.error.code, 'SESSION_OWNER_MISMATCH');
		});

		test('他ユーザーはcompleteできない', async () => {
			const session = await successfulApiCall({
				endpoint: 'drive/files/multipart/create',
				parameters: { totalParts: 1 },
				user: admin,
			});

			await failedApiCall({
				endpoint: 'drive/files/multipart/complete',
				parameters: { sessionId: session.sessionId },
				user: bob,
			}, {
				status: 400,
				code: 'SESSION_OWNER_MISMATCH',
				id: '4db1ff36-ba26-40c3-b6fd-13d6d6772c18',
			});
		});

		test('他ユーザーはabortできない', async () => {
			const session = await successfulApiCall({
				endpoint: 'drive/files/multipart/create',
				parameters: { totalParts: 1 },
				user: admin,
			});

			await failedApiCall({
				endpoint: 'drive/files/multipart/abort',
				parameters: { sessionId: session.sessionId },
				user: bob,
			}, {
				status: 400,
				code: 'SESSION_OWNER_MISMATCH',
				id: '54130e06-4f77-453e-9d12-85be5d96a4b7',
			});
		});

		test('不完全なパートでcompleteすると拒否される', async () => {
			const session = await successfulApiCall({
				endpoint: 'drive/files/multipart/create',
				parameters: { totalParts: 3 },
				user: admin,
			});

			await uploadPart(admin, session.sessionId, 1, generateRandomBlob(100));

			await failedApiCall({
				endpoint: 'drive/files/multipart/complete',
				parameters: { sessionId: session.sessionId },
				user: admin,
			}, {
				status: 400,
				code: 'INCOMPLETE_PARTS',
				id: '0cd4c705-ad68-43ee-83f5-4f91fabd9837',
			});
		});

		test('abort後はセッションが消失する', async () => {
			const session = await successfulApiCall({
				endpoint: 'drive/files/multipart/create',
				parameters: { totalParts: 2 },
				user: admin,
			});
			const sessionId = session.sessionId;

			await uploadPart(admin, sessionId, 1, generateRandomBlob(100));

			await api('drive/files/multipart/abort', { sessionId } as any, admin);

			const res = await uploadPart(admin, sessionId, 2, generateRandomBlob(100));
			assert.strictEqual(res.status, 400);
			assert.strictEqual(res.body.error.code, 'SESSION_NOT_FOUND');
		});

		test('同じパートの再送は冪等に処理される', async () => {
			const session = await successfulApiCall({
				endpoint: 'drive/files/multipart/create',
				parameters: { totalParts: 2 },
				user: admin,
			});
			const sessionId = session.sessionId;

			const blob = generateRandomBlob(100);
			const r1 = await uploadPart(admin, sessionId, 1, blob);
			assert.strictEqual(r1.status, 200);

			const r1again = await uploadPart(admin, sessionId, 1, blob);
			assert.strictEqual(r1again.status, 200);
			assert.strictEqual(r1again.body.partNumber, 1);
		});

		test('存在しないセッションへのcompleteは拒否される', async () => {
			await failedApiCall({
				endpoint: 'drive/files/multipart/complete',
				parameters: { sessionId: '00000000-0000-0000-0000-000000000000' },
				user: admin,
			}, {
				status: 400,
				code: 'SESSION_NOT_FOUND',
				id: '8ea4d889-0e1a-47eb-9d5a-0448f8f69193',
			});
		});

		test('範囲外のpartNumberは拒否される', async () => {
			const session = await successfulApiCall({
				endpoint: 'drive/files/multipart/create',
				parameters: { totalParts: 2 },
				user: admin,
			});

			const res = await uploadPart(admin, session.sessionId, 5, generateRandomBlob(100));
			assert.strictEqual(res.status, 400);
			assert.strictEqual(res.body.error.code, 'INVALID_PART_NUMBER');
		});
	});

	// --- S3 Tests (R2) ---
	const describeR2 = hasR2 ? describe : describe.skip;

	describeR2('S3直接アップロード（R2）', () => {
		beforeAll(async () => {
			const endpoint = new URL(R2_ENDPOINT!);
			await api('admin/update-meta', {
				useObjectStorage: true,
				objectStorageBucket: R2_BUCKET!,
				objectStorageEndpoint: endpoint.host,
				objectStorageAccessKey: R2_ACCESS_KEY!,
				objectStorageSecretKey: R2_SECRET_KEY!,
				objectStorageUseSSL: endpoint.protocol === 'https:',
				objectStorageS3ForcePathStyle: false,
				objectStorageSetPublicRead: false,
				objectStorageRegion: 'auto',
				objectStorageBaseUrl: `${R2_ENDPOINT}/${R2_BUCKET}`,
			} as any, admin);
		}, 1000 * 30);

		afterAll(async () => {
			await api('admin/update-meta', {
				useObjectStorage: false,
			} as any, admin);
		});

		test('S3マルチパートアップロード → complete でファイルが作成される', async () => {
			// S3 requires minimum 5MB per part (except last)
			const part1 = generateRandomBlob(5 * 1024 * 1024 + 100 * 1024);
			const part2 = generateRandomBlob(5 * 1024 * 1024 + 100 * 1024);
			const part3 = generateRandomBlob(1024 * 1024);

			const session = await successfulApiCall({
				endpoint: 'drive/files/multipart/create',
				parameters: { totalParts: 3, name: 'r2-multipart-test.bin' },
				user: admin,
			});
			const sessionId = session.sessionId;

			for (const [i, blob] of [part1, part2, part3].entries()) {
				const res = await uploadPart(admin, sessionId, i + 1, blob);
				assert.strictEqual(res.status, 200, `Part ${i + 1} failed: ${JSON.stringify(res.body)}`);
			}

			const file = await successfulApiCall({
				endpoint: 'drive/files/multipart/complete',
				parameters: { sessionId },
				user: admin,
			});
			assert.ok(file.id);
			assert.strictEqual(file.name, 'r2-multipart-test.bin');
			assert.strictEqual(file.size, part1.size + part2.size + part3.size);
			assert.ok(file.url);
		}, 1000 * 60 * 2);

		test('S3 abort でセッションが破棄される', async () => {
			const session = await successfulApiCall({
				endpoint: 'drive/files/multipart/create',
				parameters: { totalParts: 2, name: 'abort-r2.bin' },
				user: admin,
			});
			const sessionId = session.sessionId;

			await uploadPart(admin, sessionId, 1, generateRandomBlob(5 * 1024 * 1024 + 100 * 1024));

			await api('drive/files/multipart/abort', { sessionId } as any, admin);

			const res = await uploadPart(admin, sessionId, 2, generateRandomBlob(100));
			assert.strictEqual(res.status, 400);
			assert.strictEqual(res.body.error.code, 'SESSION_NOT_FOUND');
		}, 1000 * 60);
	});

	// --- Staging S3 Tests ---
	const describeStaging = hasR2Staging ? describe : describe.skip;

	describeStaging('ステージングS3（R2 → R2）', () => {
		beforeAll(async () => {
			const endpoint = new URL(R2_ENDPOINT!);
			await api('admin/update-meta', {
				useObjectStorage: true,
				objectStorageBucket: R2_BUCKET!,
				objectStorageEndpoint: endpoint.host,
				objectStorageAccessKey: R2_ACCESS_KEY!,
				objectStorageSecretKey: R2_SECRET_KEY!,
				objectStorageUseSSL: endpoint.protocol === 'https:',
				objectStorageS3ForcePathStyle: false,
				objectStorageSetPublicRead: false,
				objectStorageRegion: 'auto',
				objectStorageBaseUrl: `${R2_ENDPOINT}/${R2_BUCKET}`,
			} as any, admin);

			await sendEnvUpdateRequest({
				key: 'MISSKEY_CONFIG_YML',
				value: 'test-with-staging.yml',
			});
		}, 1000 * 30);

		afterAll(async () => {
			await sendEnvResetRequest();
			await api('admin/update-meta', {
				useObjectStorage: false,
			} as any, admin);
		});

		test('ステージングS3経由でアップロード → complete でファイルが作成される', async () => {
			const part1 = generateRandomBlob(5 * 1024 * 1024 + 100 * 1024);
			const part2 = generateRandomBlob(1024 * 1024);

			const session = await successfulApiCall({
				endpoint: 'drive/files/multipart/create',
				parameters: { totalParts: 2, name: 'staging-test.bin' },
				user: admin,
			});
			const sessionId = session.sessionId;

			for (const [i, blob] of [part1, part2].entries()) {
				const res = await uploadPart(admin, sessionId, i + 1, blob);
				assert.strictEqual(res.status, 200, `Part ${i + 1} failed: ${JSON.stringify(res.body)}`);
			}

			const file = await successfulApiCall({
				endpoint: 'drive/files/multipart/complete',
				parameters: { sessionId },
				user: admin,
			});
			assert.ok(file.id);
			assert.strictEqual(file.size, part1.size + part2.size);
		}, 1000 * 60 * 2);
	});
});
