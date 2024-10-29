import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { UserEntityService } from '@/core/entities/mikroorm/UserEntityService.js';
import { SystemWebhookEntityService } from '@/core/entities/mikroorm/SystemWebhookEntityService.js';
import type { Packed } from '@/misc/json-schema.js';
import type { AbuseReportNotificationRecipientRepository } from '@/models/mikroorm/AbuseReportNotificationRecipientRepository.js';
import type { MiAbuseReportNotificationRecipient } from '@/models/mikroorm/AbuseReportNotificationRecipient.js';

@Injectable()
export class AbuseReportNotificationRecipientEntityService {
	constructor(
		@Inject(DI.abuseReportNotificationRecipientRepository)
		private abuseReportNotificationRecipientRepository: AbuseReportNotificationRecipientRepository,
		private userEntityService: UserEntityService,
		private systemWebhookEntityService: SystemWebhookEntityService,
	) {}

	@bindThis
	public async pack(
		src: string | MiAbuseReportNotificationRecipient,
		opts?: {
			users: Map<string, Packed<'UserLite'>>,
			webhooks: Map<string, Packed<'SystemWebhook'>>,
		},
	): Promise<Packed<'AbuseReportNotificationRecipient'>> {
		const recipient = typeof src === 'object'
			? src
			: await this.abuseReportNotificationRecipientRepository.findOneOrFail({ id: src });
		const user = recipient.userId
			? (opts?.users.get(recipient.userId) ?? await this.userEntityService.pack<'UserLite'>(recipient.userId))
			: undefined;
		const webhook = recipient.systemWebhookId
			? (opts?.webhooks.get(recipient.systemWebhookId) ?? await this.systemWebhookEntityService.pack(recipient.systemWebhookId))
			: undefined;

		return {
			id: recipient.id,
			isActive: recipient.isActive,
			updatedAt: recipient.updatedAt.toISOString(),
			name: recipient.name,
			method: recipient.method,
			userId: recipient.userId ?? undefined,
			user: user,
			systemWebhookId: recipient.systemWebhookId ?? undefined,
			systemWebhook: webhook,
		};
	}

	@bindThis
	public async packMany(
		src: string[] | MiAbuseReportNotificationRecipient[],
	): Promise<Packed<'AbuseReportNotificationRecipient'>[]> {
		const objs = src.filter((it): it is MiAbuseReportNotificationRecipient => typeof it === 'object');
		const ids = src.filter((it): it is string => typeof it === 'string');
		if (ids.length > 0) {
			const foundObjs = await this.abuseReportNotificationRecipientRepository.find({ id: { $in: ids } });
			objs.push(...foundObjs);
		}

		const userIds = objs.map(it => it.userId).filter((x): x is string => x != null);
		const users: Map<string, Packed<'UserLite'>> = (userIds.length > 0)
			? await this.userEntityService.packMany(userIds)
				.then(it => new Map(it.map(it => [it.id, it])))
			: new Map();

		const systemWebhookIds = objs.map(it => it.systemWebhookId).filter((x): x is string => x != null);
		const systemWebhooks: Map<string, Packed<'SystemWebhook'>> = (systemWebhookIds.length > 0)
			? await this.systemWebhookEntityService.packMany(systemWebhookIds)
				.then(it => new Map(it.map(it => [it.id, it])))
			: new Map();

		return Promise
			.all(
				objs.map(it => this.pack(it, { users, webhooks: systemWebhooks })),
			)
			.then(it => it.sort((a, b) => a.id.localeCompare(b.id)));
	}
}
