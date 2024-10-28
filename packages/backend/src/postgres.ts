/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// https://github.com/typeorm/typeorm/issues/2400
import pg from 'pg';
import { DataSource, Logger } from 'typeorm';
import * as highlight from 'cli-highlight';
import { entities as charts } from '@/core/chart/entities-typeorm.js';

import { MiAbuseUserReport } from '@/models/typeorm/AbuseUserReport.js';
import { MiAbuseReportNotificationRecipient } from '@/models/typeorm/AbuseReportNotificationRecipient.js';
import { MiAccessToken } from '@/models/typeorm/AccessToken.js';
import { MiAd } from '@/models/typeorm/Ad.js';
import { MiAnnouncement } from '@/models/typeorm/Announcement.js';
import { MiAnnouncementRead } from '@/models/typeorm/AnnouncementRead.js';
import { MiAntenna } from '@/models/typeorm/Antenna.js';
import { MiApp } from '@/models/typeorm/App.js';
import { MiAvatarDecoration } from '@/models/typeorm/AvatarDecoration.js';
import { MiAuthSession } from '@/models/typeorm/AuthSession.js';
import { MiBlocking } from '@/models/typeorm/Blocking.js';
import { MiChannelFollowing } from '@/models/typeorm/ChannelFollowing.js';
import { MiChannelFavorite } from '@/models/typeorm/ChannelFavorite.js';
import { MiClip } from '@/models/typeorm/Clip.js';
import { MiClipNote } from '@/models/typeorm/ClipNote.js';
import { MiClipFavorite } from '@/models/typeorm/ClipFavorite.js';
import { MiDriveFile } from '@/models/typeorm/DriveFile.js';
import { MiDriveFolder } from '@/models/typeorm/DriveFolder.js';
import { MiEmoji } from '@/models/typeorm/Emoji.js';
import { MiFollowing } from '@/models/typeorm/Following.js';
import { MiFollowRequest } from '@/models/typeorm/FollowRequest.js';
import { MiGalleryLike } from '@/models/typeorm/GalleryLike.js';
import { MiGalleryPost } from '@/models/typeorm/GalleryPost.js';
import { MiHashtag } from '@/models/typeorm/Hashtag.js';
import { MiInstance } from '@/models/typeorm/Instance.js';
import { MiMeta } from '@/models/typeorm/Meta.js';
import { MiModerationLog } from '@/models/typeorm/ModerationLog.js';
import { MiMuting } from '@/models/typeorm/Muting.js';
import { MiRenoteMuting } from '@/models/typeorm/RenoteMuting.js';
import { MiNote } from '@/models/typeorm/Note.js';
import { MiNoteFavorite } from '@/models/typeorm/NoteFavorite.js';
import { MiNoteReaction } from '@/models/typeorm/NoteReaction.js';
import { MiNoteThreadMuting } from '@/models/typeorm/NoteThreadMuting.js';
import { MiNoteUnread } from '@/models/typeorm/NoteUnread.js';
import { MiPage } from '@/models/typeorm/Page.js';
import { MiPageLike } from '@/models/typeorm/PageLike.js';
import { MiPasswordResetRequest } from '@/models/typeorm/PasswordResetRequest.js';
import { MiPoll } from '@/models/typeorm/Poll.js';
import { MiPollVote } from '@/models/typeorm/PollVote.js';
import { MiPromoNote } from '@/models/typeorm/PromoNote.js';
import { MiPromoRead } from '@/models/typeorm/PromoRead.js';
import { MiRegistrationTicket } from '@/models/typeorm/RegistrationTicket.js';
import { MiRegistryItem } from '@/models/typeorm/RegistryItem.js';
import { MiRelay } from '@/models/typeorm/Relay.js';
import { MiSignin } from '@/models/typeorm/Signin.js';
import { MiSwSubscription } from '@/models/typeorm/SwSubscription.js';
import { MiUsedUsername } from '@/models/typeorm/UsedUsername.js';
import { MiUser } from '@/models/typeorm/User.js';
import { MiUserIp } from '@/models/typeorm/UserIp.js';
import { MiUserKeypair } from '@/models/typeorm/UserKeypair.js';
import { MiUserList } from '@/models/typeorm/UserList.js';
import { MiUserListFavorite } from '@/models/typeorm/UserListFavorite.js';
import { MiUserListMembership } from '@/models/typeorm/UserListMembership.js';
import { MiUserNotePining } from '@/models/typeorm/UserNotePining.js';
import { MiUserPending } from '@/models/typeorm/UserPending.js';
import { MiUserProfile } from '@/models/typeorm/UserProfile.js';
import { MiUserPublickey } from '@/models/typeorm/UserPublickey.js';
import { MiUserSecurityKey } from '@/models/typeorm/UserSecurityKey.js';
import { MiWebhook } from '@/models/typeorm/Webhook.js';
import { MiSystemWebhook } from '@/models/typeorm/SystemWebhook.js';
import { MiChannel } from '@/models/typeorm/Channel.js';
import { MiRetentionAggregation } from '@/models/typeorm/RetentionAggregation.js';
import { MiRole } from '@/models/typeorm/Role.js';
import { MiRoleAssignment } from '@/models/typeorm/RoleAssignment.js';
import { MiFlash } from '@/models/typeorm/Flash.js';
import { MiFlashLike } from '@/models/typeorm/FlashLike.js';
import { MiUserMemo } from '@/models/typeorm/UserMemo.js';
import { MiBubbleGameRecord } from '@/models/typeorm/BubbleGameRecord.js';
import { MiReversiGame } from '@/models/typeorm/ReversiGame.js';

import { Config } from '@/config.js';
import MisskeyLogger from '@/logger.js';
import { bindThis } from '@/decorators.js';

pg.types.setTypeParser(20, Number);

export const dbLogger = new MisskeyLogger('db');

const sqlLogger = dbLogger.createSubLogger('sql', 'gray');

class MyCustomLogger implements Logger {
	@bindThis
	private highlight(sql: string) {
		return highlight.highlight(sql, {
			language: 'sql', ignoreIllegals: true,
		});
	}

	@bindThis
	public logQuery(query: string, parameters?: any[]) {
		sqlLogger.info(this.highlight(query).substring(0, 100));
	}

	@bindThis
	public logQueryError(error: string, query: string, parameters?: any[]) {
		sqlLogger.error(this.highlight(query));
	}

	@bindThis
	public logQuerySlow(time: number, query: string, parameters?: any[]) {
		sqlLogger.warn(this.highlight(query));
	}

	@bindThis
	public logSchemaBuild(message: string) {
		sqlLogger.info(message);
	}

	@bindThis
	public log(message: string) {
		sqlLogger.info(message);
	}

	@bindThis
	public logMigration(message: string) {
		sqlLogger.info(message);
	}
}

export const entitiesOfTypeORM = [
	MiAnnouncement,
	MiAnnouncementRead,
	MiMeta,
	MiInstance,
	MiApp,
	MiAvatarDecoration,
	MiAuthSession,
	MiAccessToken,
	MiUser,
	MiUserProfile,
	MiUserKeypair,
	MiUserPublickey,
	MiUserList,
	MiUserListFavorite,
	MiUserListMembership,
	MiUserNotePining,
	MiUserSecurityKey,
	MiUsedUsername,
	MiFollowing,
	MiFollowRequest,
	MiMuting,
	MiRenoteMuting,
	MiBlocking,
	MiNote,
	MiNoteFavorite,
	MiNoteReaction,
	MiNoteThreadMuting,
	MiNoteUnread,
	MiPage,
	MiPageLike,
	MiGalleryPost,
	MiGalleryLike,
	MiDriveFile,
	MiDriveFolder,
	MiPoll,
	MiPollVote,
	MiEmoji,
	MiHashtag,
	MiSwSubscription,
	MiAbuseUserReport,
	MiAbuseReportNotificationRecipient,
	MiRegistrationTicket,
	MiSignin,
	MiModerationLog,
	MiClip,
	MiClipNote,
	MiClipFavorite,
	MiAntenna,
	MiPromoNote,
	MiPromoRead,
	MiRelay,
	MiChannel,
	MiChannelFollowing,
	MiChannelFavorite,
	MiRegistryItem,
	MiAd,
	MiPasswordResetRequest,
	MiUserPending,
	MiWebhook,
	MiSystemWebhook,
	MiUserIp,
	MiRetentionAggregation,
	MiRole,
	MiRoleAssignment,
	MiFlash,
	MiFlashLike,
	MiUserMemo,
	MiBubbleGameRecord,
	MiReversiGame,
	...charts,
];

const log = process.env.NODE_ENV !== 'production';

export function createPostgresDataSourceWithTypeORM(config: Config) {
	return new DataSource({
		type: 'postgres',
		host: config.db.host,
		port: config.db.port,
		username: config.db.user,
		password: config.db.pass,
		database: config.db.db,
		extra: {
			...config.db.extra,
		},
		...(config.dbReplications ? {
			replication: {
				master: {
					host: config.db.host,
					port: config.db.port,
					username: config.db.user,
					password: config.db.pass,
					database: config.db.db,
				},
				slaves: config.dbSlaves!.map(rep => ({
					host: rep.host,
					port: rep.port,
					username: rep.user,
					password: rep.pass,
					database: rep.db,
				})),
			},
		} : {}),
		synchronize: process.env.NODE_ENV === 'test',
		dropSchema: process.env.NODE_ENV === 'test',
		cache: !config.db.disableCache && process.env.NODE_ENV !== 'test' ? { // dbをcloseしても何故かredisのコネクションが内部的に残り続けるようで、テストの際に支障が出るため無効にする(キャッシュも含めてテストしたいため本当は有効にしたいが...)
			type: 'ioredis',
			options: {
				host: config.redis.host,
				port: config.redis.port,
				family: config.redis.family ?? 0,
				password: config.redis.pass,
				keyPrefix: `${config.redis.prefix}:query:`,
				db: config.redis.db ?? 0,
			},
		} : false,
		logging: log,
		logger: log ? new MyCustomLogger() : undefined,
		maxQueryExecutionTime: 300,
		entities: entitiesOfTypeORM,
		migrations: ['../../migration/*.js'],
	});
}
