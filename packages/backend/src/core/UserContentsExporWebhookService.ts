import { Injectable } from '@nestjs/common';
import type { MiDriveFile, MiUser } from '@/models/_.js';
import { bindThis } from '@/decorators.js';
import { SystemWebhookService } from '@/core/SystemWebhookService.js';

@Injectable()
export class UserContentsExporWebhookService {
	constructor(
		private systemWebhookService: SystemWebhookService,
	) {
	}

	@bindThis
	public async notifySystemWebhook (user:MiUser, driveFile:MiDriveFile, type: 'notes' | 'following' | 'muting' | 'blocking') {
		const userId = user.id;
		const url = driveFile.url;
		const md5 = driveFile.md5;

		const payload = {
			type,
			url,
			md5,
			userId,
		};

		const recipientWebhookIds = await this.systemWebhookService.fetchSystemWebhooks({ isActive: true, on: ['exportCompleted'] });
		for (const webhookId of recipientWebhookIds) {
			await this.systemWebhookService.enqueueSystemWebhook(
				webhookId,
				'exportCompleted',
				payload,
			);
		}
	}
};
