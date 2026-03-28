import * as assert from 'assert';
import { apiViaLB, apiTo, uploadPartTo, uploadPartViaLB, signup, generateRandomBlob } from './utils.js';
import type * as misskey from 'misskey-js';

const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY;
const R2_SECRET_KEY = process.env.R2_SECRET_KEY;
const R2_BUCKET = process.env.R2_BUCKET;
const R2_STAGING_BUCKET = process.env.R2_STAGING_BUCKET;
const hasR2 = !!(R2_ENDPOINT && R2_ACCESS_KEY && R2_SECRET_KEY && R2_BUCKET);
const hasR2Staging = !!(hasR2 && R2_STAGING_BUCKET);

describe('Multipart Upload (Cluster)', () => {
	let admin: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;

	beforeAll(async () => {
		admin = await signup({ username: 'admin' });
		bob = await signup({ username: 'bob' });
	}, 1000 * 60 * 2);

	describe('ローカルストレージ: パート分散', () => {
		test('異なるインスタンスにパートが分散してもcompleteが成功する', async () => {
			const blob1 = generateRandomBlob(1024);
			const blob2 = generateRandomBlob(1024);
			const blob3 = generateRandomBlob(1024);

			// create → instance-1
			const session = await apiTo('instance-1', 'drive/files/multipart/create', {
				totalParts: 3, name: 'cluster-test.bin',
			}, admin);
			assert.strictEqual(session.status, 200);
			const sessionId = session.body.sessionId;

			// parts distributed across instances
			const r1 = await uploadPartTo('instance-1', admin, sessionId, 1, blob1);
			assert.strictEqual(r1.status, 200);

			const r2 = await uploadPartTo('instance-2', admin, sessionId, 2, blob2);
			assert.strictEqual(r2.status, 200);

			const r3 = await uploadPartTo('instance-1', admin, sessionId, 3, blob3);
			assert.strictEqual(r3.status, 200);
			assert.strictEqual(r3.body.done, true);

			// complete → instance-2 (different from create)
			const file = await apiTo('instance-2', 'drive/files/multipart/complete', {
				sessionId,
			}, admin);
			assert.strictEqual(file.status, 200);
			assert.ok(file.body.id);
			assert.strictEqual(file.body.name, 'cluster-test.bin');
			assert.strictEqual(file.body.size, 3072);
		});

		test('ラウンドロビンでパートをアップロードしても成功する', async () => {
			const session = await apiViaLB('drive/files/multipart/create', {
				totalParts: 5, name: 'roundrobin-test.bin',
			}, admin);
			assert.strictEqual(session.status, 200);
			const sessionId = session.body.sessionId;

			for (let i = 1; i <= 5; i++) {
				const res = await uploadPartViaLB(admin, sessionId, i, generateRandomBlob(512));
				assert.strictEqual(res.status, 200, `Part ${i} failed`);
			}

			const file = await apiViaLB('drive/files/multipart/complete', { sessionId }, admin);
			assert.strictEqual(file.status, 200);
			assert.ok(file.body.id);
			assert.strictEqual(file.body.size, 512 * 5);
		});

		test('instance-1でcreate → instance-2でabortが成功する', async () => {
			const session = await apiTo('instance-1', 'drive/files/multipart/create', {
				totalParts: 2,
			}, admin);
			const sessionId = session.body.sessionId;

			await uploadPartTo('instance-1', admin, sessionId, 1, generateRandomBlob(100));

			// abort from different instance
			const abort = await apiTo('instance-2', 'drive/files/multipart/abort', {
				sessionId,
			}, admin);
			assert.strictEqual(abort.status, 204);

			// session gone from both instances
			const check1 = await uploadPartTo('instance-1', admin, sessionId, 2, generateRandomBlob(100));
			assert.strictEqual(check1.status, 400);
			assert.strictEqual(check1.body.error.code, 'SESSION_NOT_FOUND');

			const check2 = await uploadPartTo('instance-2', admin, sessionId, 2, generateRandomBlob(100));
			assert.strictEqual(check2.status, 400);
			assert.strictEqual(check2.body.error.code, 'SESSION_NOT_FOUND');
		});

		test('他ユーザーは別インスタンスからでもセッションにアクセスできない', async () => {
			const session = await apiTo('instance-1', 'drive/files/multipart/create', {
				totalParts: 1,
			}, admin);
			const sessionId = session.body.sessionId;

			// bob tries from instance-2
			const res = await uploadPartTo('instance-2', bob, sessionId, 1, generateRandomBlob(100));
			assert.strictEqual(res.status, 400);
			assert.strictEqual(res.body.error.code, 'SESSION_OWNER_MISMATCH');

			const complete = await apiTo('instance-2', 'drive/files/multipart/complete', {
				sessionId,
			}, bob);
			assert.strictEqual(complete.status, 400);
			assert.strictEqual(complete.body.error.code, 'SESSION_OWNER_MISMATCH');
		});

		test('不完全なパートでは別インスタンスからcompleteできない', async () => {
			const session = await apiTo('instance-1', 'drive/files/multipart/create', {
				totalParts: 3,
			}, admin);
			const sessionId = session.body.sessionId;

			await uploadPartTo('instance-1', admin, sessionId, 1, generateRandomBlob(100));

			const complete = await apiTo('instance-2', 'drive/files/multipart/complete', {
				sessionId,
			}, admin);
			assert.strictEqual(complete.status, 400);
			assert.strictEqual(complete.body.error.code, 'INCOMPLETE_PARTS');
		});
	});

	// --- S3 Tests (R2) ---
	const describeR2 = hasR2 ? describe : describe.skip;

	describeR2('S3 + クラスタ: R2', () => {
		const createdFileIds: string[] = [];

		beforeAll(async () => {
			const endpoint = new URL(R2_ENDPOINT!);
			await apiTo('instance-1', 'admin/update-meta', {
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
			}, admin);
		}, 1000 * 30);

		afterAll(async () => {
			// Clean up created files (also deletes S3 objects)
			for (const fileId of createdFileIds) {
				await apiViaLB('drive/files/delete', { fileId }, admin);
			}
			await apiTo('instance-1', 'admin/update-meta', {
				useObjectStorage: false,
			}, admin);
		});

		test('S3パートが分散してもcompleteが成功する', async () => {
			// S3 minimum 5MB per part (except last)
			const part1 = generateRandomBlob(5 * 1024 * 1024 + 100 * 1024);
			const part2 = generateRandomBlob(5 * 1024 * 1024 + 100 * 1024);
			const part3 = generateRandomBlob(1024 * 1024);

			const session = await apiTo('instance-1', 'drive/files/multipart/create', {
				totalParts: 3, name: 'r2-cluster-test.bin',
			}, admin);
			assert.strictEqual(session.status, 200);
			const sessionId = session.body.sessionId;

			// Distribute across instances
			await uploadPartTo('instance-1', admin, sessionId, 1, part1);
			await uploadPartTo('instance-2', admin, sessionId, 2, part2);
			await uploadPartTo('instance-1', admin, sessionId, 3, part3);

			// Complete from instance-2
			const file = await apiTo('instance-2', 'drive/files/multipart/complete', {
				sessionId,
			}, admin);
			assert.strictEqual(file.status, 200);
			assert.ok(file.body.id);
			assert.strictEqual(file.body.size, part1.size + part2.size + part3.size);
			assert.ok(file.body.url);

			createdFileIds.push(file.body.id);
		}, 1000 * 60 * 3);
	});

	// --- Staging S3 Tests (R2 → R2) ---
	const describeStaging = hasR2Staging ? describe : describe.skip;

	describeStaging('ステージングS3 + クラスタ: R2 → R2', () => {
		const createdFileIds: string[] = [];

		beforeAll(async () => {
			// Enable object storage (staging config is already in default.yml via setup.sh)
			const endpoint = new URL(R2_ENDPOINT!);
			await apiTo('instance-1', 'admin/update-meta', {
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
			}, admin);
		}, 1000 * 30);

		afterAll(async () => {
			for (const fileId of createdFileIds) {
				await apiViaLB('drive/files/delete', { fileId }, admin);
			}
			await apiTo('instance-1', 'admin/update-meta', {
				useObjectStorage: false,
			}, admin);
		});

		test('ステージングS3経由でパートが分散してもcompleteが成功する', async () => {
			const part1 = generateRandomBlob(5 * 1024 * 1024 + 100 * 1024);
			const part2 = generateRandomBlob(1024 * 1024);

			// create on instance-1
			const session = await apiTo('instance-1', 'drive/files/multipart/create', {
				totalParts: 2, name: 'staging-cluster-test.bin',
			}, admin);
			assert.strictEqual(session.status, 200);
			const sessionId = session.body.sessionId;

			// Upload parts across instances (chunks go to staging S3)
			await uploadPartTo('instance-2', admin, sessionId, 1, part1);
			await uploadPartTo('instance-1', admin, sessionId, 2, part2);

			// Complete from instance-2 (assembles on staging, then transfers to production)
			const file = await apiTo('instance-2', 'drive/files/multipart/complete', {
				sessionId,
			}, admin);
			assert.strictEqual(file.status, 200);
			assert.ok(file.body.id);
			assert.strictEqual(file.body.size, part1.size + part2.size);
			// URL should point to production bucket, not staging
			assert.ok(file.body.url);

			createdFileIds.push(file.body.id);
		}, 1000 * 60 * 3);
	});
});
