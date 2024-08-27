import { Inject, Injectable } from '@nestjs/common';
import { QueueService } from '@/core/QueueService.js';
import { RoleService } from '@/core/RoleService.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { MetaService } from '@/core/MetaService.js';
import { DriveService } from '@/core/DriveService.js';
import type { Config } from '@/config.js';
import type { DriveFilesRepository, UsersRepository } from '@/models/_.js';
import { bindThis } from '@/decorators.js';
import { DI } from '@/di-symbols.js';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';

export const supportedTypes = [
	'notes',
	'following',
	'muting',
	'blocking',
] as const;

const supportedTypesFriendlyNames = {
	notes: 'ノート',
	following: 'フォロー',
	muting: 'ミュート',
	blocking: 'ブロック',
} as const satisfies Record<typeof supportedTypes[number], string>;

@Injectable()
export class BskWebhookServerService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private driveService: DriveService,
		private httpRequestService: HttpRequestService,
		private metaService: MetaService,
		private queueService: QueueService,
		private roleService: RoleService,
	) {}

	@bindThis
	private assertSupportedType(type: string): type is typeof supportedTypes[number] {
		return (supportedTypes as readonly string[]).includes(type);
	}

	@bindThis
	public createServer(fastify: FastifyInstance, options: FastifyPluginOptions, done: (err?: Error) => void) {
		fastify.post('/', async (request, reply) => {
			if (request.headers['content-type'] !== 'application/json') {
				reply.code(400).send('Content-Type must be application/json');
				return;
			}

			if (request.headers['x-misskey-host'] !== this.config.bskHost) {
				reply.code(400).send('Invalid host');
				return;
			}

			if (request.headers['x-misskey-hook-secret'] !== this.config.bskSystemWebhookSecret) {
				reply.code(400).send('Invalid secret');
				return;
			}

			const body = request.body as unknown;

			if (
				body == null ||
				typeof body !== 'object' ||
				'type' in body === false ||
				'body' in body === false ||
				body.body == null ||
				typeof body.body !== 'object'
			) {
				reply.code(400).send('Invalid body (1)');
				return;
			}

			if (body.type !== 'exportCompleted') {
				reply.code(204);
				return;
			}

			if (
				'type' in body.body === false ||
				typeof body.body.type !== 'string' ||
				this.assertSupportedType(body.body.type) === false ||
				'url' in body.body === false ||
				typeof body.body.url !== 'string' ||
				'md5' in body.body === false ||
				typeof body.body.md5 !== 'string' ||
				'userId' in body.body === false ||
				typeof body.body.userId !== 'string'
			) {
				reply.code(400).send('Invalid body (2)');
				return;
			}

			// 1. bskで認証済みのユーザーが存在するか確認
			const user = await this.usersRepository.findOneBy({ bskUserId: body.body.userId });

			if (user == null) {
				reply.code(204);
				return;
			}

			// 2. 同様のジョブを過去にやってないか確認
			if (user.bskMigratedEntities.includes(body.body.type)) {
				const meta = await this.metaService.fetch();

				await this.httpRequestService.send(`https://${this.config.bskHost}/api/notifications/create`, {
					method: 'POST',
					body: JSON.stringify({
						icon: meta.iconUrl,
						header: `${supportedTypesFriendlyNames[body.body.type]}は一度BackspaceKeyからインポートされています`,
						body: '自動インポートに失敗している場合は、お手数ですが手動でインポートしてください。',
						i: user.bskAccessToken,
					}),
					headers: {
						'Content-Type': 'application/json',
					},
					timeout: 3000,
				}).catch(() => { });

				reply.code(204);
				return;
			}

			// 3. えくすぽーとされたファイルをアップロード
			const file = await this.driveService.uploadFromUrl({
				url: body.body.url,
				user,
			});

			// 4. ファイルが正しいか確認
			if (file.md5 !== body.body.md5) {
				await this.driveFilesRepository.delete(file.id);
				reply.code(204);
				return;
			}

			// 5. インポートジョブを開始
			const policies = await this.roleService.getUserPolicies(user.id);

			switch (body.body.type) {
				case 'notes':
					if (policies.canImportNotes === false) {
						await this.driveFilesRepository.delete(file.id);
						reply.code(204);
						return;
					}

					this.queueService.createImportNotesJob(user, file.id, 'Misskey');
					break;
				case 'following':
					this.queueService.createImportFollowingJob(user, file.id);
					break;
				case 'muting':
					this.queueService.createImportMutingJob(user, file.id);
					break;
				case 'blocking':
					this.queueService.createImportBlockingJob(user, file.id);
					break;
				default:
					await this.driveFilesRepository.delete(file.id);
					reply.code(204);
					return;
			}

			// 6. ユーザーの状態を更新
			await this.usersRepository.update(user.id, {
				bskMigratedEntities: [...user.bskMigratedEntities, body.body.type],
			});

			// 7. 通知を送信
			const meta = await this.metaService.fetch();
			await this.httpRequestService.send(`https://${this.config.bskHost}/api/notifications/create`, {
				method: 'POST',
				body: JSON.stringify({
					icon: meta.iconUrl,
					header: `${supportedTypesFriendlyNames[body.body.type]}のインポートが開始されました`,
					body: 'インポートには時間がかかります。',
					i: user.bskAccessToken,
				}),
				headers: {
					'Content-Type': 'application/json',
				},
				timeout: 3000,
			}).catch(() => { });

			reply.code(204);
		});

		done();
	}
}
