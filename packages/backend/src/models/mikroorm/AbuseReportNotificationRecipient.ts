import {
	Entity,
	PrimaryKey,
	Property,
	ManyToOne,
	Index,
} from '@mikro-orm/core';
import { id } from '../util/id-mikrooorm.js'; // id関数のインポート
import { MiSystemWebhook } from './SystemWebhook';
import { MiUserProfile } from './UserProfile';
import { MiUser } from './User';

/**
 * 通報受信時に通知を送信する方法.
 */
export type RecipientMethod = 'email' | 'webhook';

@Entity({ tableName: 'abuse_report_notification_recipient' })
export class MiAbuseReportNotificationRecipient {
	@PrimaryKey({ type: id() })
		id: string;

	@Index()
	@Property({ type: 'boolean', default: true })
		isActive: boolean;

	@Property({
		type: 'timestamp with time zone',
		onUpdate: () => new Date(),
		defaultRaw: 'CURRENT_TIMESTAMP',
	})
		updatedAt: Date;

	@Property({ type: 'varchar', length: 255 })
		name: string;

	@Index()
	@Property({ type: 'varchar', length: 64 })
		method: RecipientMethod;

	@Index()
	@Property({ type: id(), nullable: true })
		userId: string | null;

	@ManyToOne(() => MiUser, { nullable: true, onDelete: 'cascade' })
		user: MiUser | null;

	@ManyToOne(() => MiUserProfile, { nullable: true })
		userProfile: MiUserProfile | null;

	@Index()
	@Property({ type: id(), nullable: true })
		systemWebhookId: string | null;

	@ManyToOne(() => MiSystemWebhook, { nullable: true, onDelete: 'cascade' })
		systemWebhook: MiSystemWebhook | null;
}
