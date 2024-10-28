/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { FindOneOptions, InsertQueryBuilder, ObjectLiteral, Repository, SelectQueryBuilder, TypeORMError } from 'typeorm';
import { DriverUtils } from 'typeorm/driver/DriverUtils.js';
import { RelationCountLoader } from 'typeorm/query-builder/relation-count/RelationCountLoader.js';
import { RelationIdLoader } from 'typeorm/query-builder/relation-id/RelationIdLoader.js';
import { RawSqlResultsToEntityTransformer } from 'typeorm/query-builder/transformer/RawSqlResultsToEntityTransformer.js';
import { ObjectUtils } from 'typeorm/util/ObjectUtils.js';
import { OrmUtils } from 'typeorm/util/OrmUtils.js';
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
import { MiUserListMembership } from '@/models/typeorm/UserListMembership.js';
import { MiUserNotePining } from '@/models/typeorm/UserNotePining.js';
import { MiUserPending } from '@/models/typeorm/UserPending.js';
import { MiUserProfile } from '@/models/typeorm/UserProfile.js';
import { MiUserPublickey } from '@/models/typeorm/UserPublickey.js';
import { MiUserSecurityKey } from '@/models/typeorm/UserSecurityKey.js';
import { MiUserMemo } from '@/models/typeorm/UserMemo.js';
import { MiWebhook } from '@/models/typeorm/Webhook.js';
import { MiSystemWebhook } from '@/models/typeorm/SystemWebhook.js';
import { MiChannel } from '@/models/typeorm/Channel.js';
import { MiRetentionAggregation } from '@/models/typeorm/RetentionAggregation.js';
import { MiRole } from '@/models/typeorm/Role.js';
import { MiRoleAssignment } from '@/models/typeorm/RoleAssignment.js';
import { MiFlash } from '@/models/typeorm/Flash.js';
import { MiFlashLike } from '@/models/typeorm/FlashLike.js';
import { MiUserListFavorite } from '@/models/typeorm/UserListFavorite.js';
import { MiBubbleGameRecord } from '@/models/typeorm/BubbleGameRecord.js';
import { MiReversiGame } from '@/models/typeorm/ReversiGame.js';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity.js';

export interface MiRepository<T extends ObjectLiteral> {
	createTableColumnNames(this: Repository<T> & MiRepository<T>): string[];
	insertOne(this: Repository<T> & MiRepository<T>, entity: QueryDeepPartialEntity<T>, findOptions?: Pick<FindOneOptions<T>, 'relations'>): Promise<T>;
	selectAliasColumnNames(this: Repository<T> & MiRepository<T>, queryBuilder: InsertQueryBuilder<T>, builder: SelectQueryBuilder<T>): void;
}

export const miRepository = {
	createTableColumnNames() {
		return this.metadata.columns.filter(column => column.isSelect && !column.isVirtual).map(column => column.databaseName);
	},
	async insertOne(entity, findOptions?) {
		const queryBuilder = this.createQueryBuilder().insert().values(entity);
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const mainAlias = queryBuilder.expressionMap.mainAlias!;
		const name = mainAlias.name;
		mainAlias.name = 't';
		const columnNames = this.createTableColumnNames();
		queryBuilder.returning(columnNames.reduce((a, c) => `${a}, ${queryBuilder.escape(c)}`, '').slice(2));
		const builder = this.createQueryBuilder().addCommonTableExpression(queryBuilder, 'cte', { columnNames });
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		builder.expressionMap.mainAlias!.tablePath = 'cte';
		this.selectAliasColumnNames(queryBuilder, builder);
		if (findOptions) {
			builder.setFindOptions(findOptions);
		}
		const raw = await builder.execute();
		mainAlias.name = name;
		const relationId = await new RelationIdLoader(builder.connection, this.queryRunner, builder.expressionMap.relationIdAttributes).load(raw);
		const relationCount = await new RelationCountLoader(builder.connection, this.queryRunner, builder.expressionMap.relationCountAttributes).load(raw);
		const result = new RawSqlResultsToEntityTransformer(builder.expressionMap, builder.connection.driver, relationId, relationCount, this.queryRunner).transform(raw, mainAlias);
		return result[0];
	},
	selectAliasColumnNames(queryBuilder, builder) {
		let selectOrAddSelect = (selection: string, selectionAliasName?: string) => {
			selectOrAddSelect = (selection, selectionAliasName) => builder.addSelect(selection, selectionAliasName);
			return builder.select(selection, selectionAliasName);
		};
		for (const columnName of this.createTableColumnNames()) {
			selectOrAddSelect(`${builder.alias}.${columnName}`, `${builder.alias}_${columnName}`);
		}
	},
} satisfies MiRepository<ObjectLiteral>;

export {
	MiAbuseUserReport,
	MiAbuseReportNotificationRecipient,
	MiAccessToken,
	MiAd,
	MiAnnouncement,
	MiAnnouncementRead,
	MiAntenna,
	MiApp,
	MiAvatarDecoration,
	MiAuthSession,
	MiBlocking,
	MiChannelFollowing,
	MiChannelFavorite,
	MiClip,
	MiClipNote,
	MiClipFavorite,
	MiDriveFile,
	MiDriveFolder,
	MiEmoji,
	MiFollowing,
	MiFollowRequest,
	MiGalleryLike,
	MiGalleryPost,
	MiHashtag,
	MiInstance,
	MiMeta,
	MiModerationLog,
	MiMuting,
	MiRenoteMuting,
	MiNote,
	MiNoteFavorite,
	MiNoteReaction,
	MiNoteThreadMuting,
	MiNoteUnread,
	MiPage,
	MiPageLike,
	MiPasswordResetRequest,
	MiPoll,
	MiPollVote,
	MiPromoNote,
	MiPromoRead,
	MiRegistrationTicket,
	MiRegistryItem,
	MiRelay,
	MiSignin,
	MiSwSubscription,
	MiUsedUsername,
	MiUser,
	MiUserIp,
	MiUserKeypair,
	MiUserList,
	MiUserListFavorite,
	MiUserListMembership,
	MiUserNotePining,
	MiUserPending,
	MiUserProfile,
	MiUserPublickey,
	MiUserSecurityKey,
	MiWebhook,
	MiSystemWebhook,
	MiChannel,
	MiRetentionAggregation,
	MiRole,
	MiRoleAssignment,
	MiFlash,
	MiFlashLike,
	MiUserMemo,
	MiBubbleGameRecord,
	MiReversiGame,
};

export type AbuseUserReportsRepository = Repository<MiAbuseUserReport> & MiRepository<MiAbuseUserReport>;
export type AbuseReportNotificationRecipientRepository = Repository<MiAbuseReportNotificationRecipient> & MiRepository<MiAbuseReportNotificationRecipient>;
export type AccessTokensRepository = Repository<MiAccessToken> & MiRepository<MiAccessToken>;
export type AdsRepository = Repository<MiAd> & MiRepository<MiAd>;
export type AnnouncementsRepository = Repository<MiAnnouncement> & MiRepository<MiAnnouncement>;
export type AnnouncementReadsRepository = Repository<MiAnnouncementRead> & MiRepository<MiAnnouncementRead>;
export type AntennasRepository = Repository<MiAntenna> & MiRepository<MiAntenna>;
export type AppsRepository = Repository<MiApp> & MiRepository<MiApp>;
export type AvatarDecorationsRepository = Repository<MiAvatarDecoration> & MiRepository<MiAvatarDecoration>;
export type AuthSessionsRepository = Repository<MiAuthSession> & MiRepository<MiAuthSession>;
export type BlockingsRepository = Repository<MiBlocking> & MiRepository<MiBlocking>;
export type ChannelFollowingsRepository = Repository<MiChannelFollowing> & MiRepository<MiChannelFollowing>;
export type ChannelFavoritesRepository = Repository<MiChannelFavorite> & MiRepository<MiChannelFavorite>;
export type ClipsRepository = Repository<MiClip> & MiRepository<MiClip>;
export type ClipNotesRepository = Repository<MiClipNote> & MiRepository<MiClipNote>;
export type ClipFavoritesRepository = Repository<MiClipFavorite> & MiRepository<MiClipFavorite>;
export type DriveFilesRepository = Repository<MiDriveFile> & MiRepository<MiDriveFile>;
export type DriveFoldersRepository = Repository<MiDriveFolder> & MiRepository<MiDriveFolder>;
export type EmojisRepository = Repository<MiEmoji> & MiRepository<MiEmoji>;
export type FollowingsRepository = Repository<MiFollowing> & MiRepository<MiFollowing>;
export type FollowRequestsRepository = Repository<MiFollowRequest> & MiRepository<MiFollowRequest>;
export type GalleryLikesRepository = Repository<MiGalleryLike> & MiRepository<MiGalleryLike>;
export type GalleryPostsRepository = Repository<MiGalleryPost> & MiRepository<MiGalleryPost>;
export type HashtagsRepository = Repository<MiHashtag> & MiRepository<MiHashtag>;
export type InstancesRepository = Repository<MiInstance> & MiRepository<MiInstance>;
export type MetasRepository = Repository<MiMeta> & MiRepository<MiMeta>;
export type ModerationLogsRepository = Repository<MiModerationLog> & MiRepository<MiModerationLog>;
export type MutingsRepository = Repository<MiMuting> & MiRepository<MiMuting>;
export type RenoteMutingsRepository = Repository<MiRenoteMuting> & MiRepository<MiRenoteMuting>;
export type NotesRepository = Repository<MiNote> & MiRepository<MiNote>;
export type NoteFavoritesRepository = Repository<MiNoteFavorite> & MiRepository<MiNoteFavorite>;
export type NoteReactionsRepository = Repository<MiNoteReaction> & MiRepository<MiNoteReaction>;
export type NoteThreadMutingsRepository = Repository<MiNoteThreadMuting> & MiRepository<MiNoteThreadMuting>;
export type NoteUnreadsRepository = Repository<MiNoteUnread> & MiRepository<MiNoteUnread>;
export type PagesRepository = Repository<MiPage> & MiRepository<MiPage>;
export type PageLikesRepository = Repository<MiPageLike> & MiRepository<MiPageLike>;
export type PasswordResetRequestsRepository = Repository<MiPasswordResetRequest> & MiRepository<MiPasswordResetRequest>;
export type PollsRepository = Repository<MiPoll> & MiRepository<MiPoll>;
export type PollVotesRepository = Repository<MiPollVote> & MiRepository<MiPollVote>;
export type PromoNotesRepository = Repository<MiPromoNote> & MiRepository<MiPromoNote>;
export type PromoReadsRepository = Repository<MiPromoRead> & MiRepository<MiPromoRead>;
export type RegistrationTicketsRepository = Repository<MiRegistrationTicket> & MiRepository<MiRegistrationTicket>;
export type RegistryItemsRepository = Repository<MiRegistryItem> & MiRepository<MiRegistryItem>;
export type RelaysRepository = Repository<MiRelay> & MiRepository<MiRelay>;
export type SigninsRepository = Repository<MiSignin> & MiRepository<MiSignin>;
export type SwSubscriptionsRepository = Repository<MiSwSubscription> & MiRepository<MiSwSubscription>;
export type UsedUsernamesRepository = Repository<MiUsedUsername> & MiRepository<MiUsedUsername>;
export type UsersRepository = Repository<MiUser> & MiRepository<MiUser>;
export type UserIpsRepository = Repository<MiUserIp> & MiRepository<MiUserIp>;
export type UserKeypairsRepository = Repository<MiUserKeypair> & MiRepository<MiUserKeypair>;
export type UserListsRepository = Repository<MiUserList> & MiRepository<MiUserList>;
export type UserListFavoritesRepository = Repository<MiUserListFavorite> & MiRepository<MiUserListFavorite>;
export type UserListMembershipsRepository = Repository<MiUserListMembership> & MiRepository<MiUserListMembership>;
export type UserNotePiningsRepository = Repository<MiUserNotePining> & MiRepository<MiUserNotePining>;
export type UserPendingsRepository = Repository<MiUserPending> & MiRepository<MiUserPending>;
export type UserProfilesRepository = Repository<MiUserProfile> & MiRepository<MiUserProfile>;
export type UserPublickeysRepository = Repository<MiUserPublickey> & MiRepository<MiUserPublickey>;
export type UserSecurityKeysRepository = Repository<MiUserSecurityKey> & MiRepository<MiUserSecurityKey>;
export type WebhooksRepository = Repository<MiWebhook> & MiRepository<MiWebhook>;
export type SystemWebhooksRepository = Repository<MiSystemWebhook> & MiRepository<MiWebhook>;
export type ChannelsRepository = Repository<MiChannel> & MiRepository<MiChannel>;
export type RetentionAggregationsRepository = Repository<MiRetentionAggregation> & MiRepository<MiRetentionAggregation>;
export type RolesRepository = Repository<MiRole> & MiRepository<MiRole>;
export type RoleAssignmentsRepository = Repository<MiRoleAssignment> & MiRepository<MiRoleAssignment>;
export type FlashsRepository = Repository<MiFlash> & MiRepository<MiFlash>;
export type FlashLikesRepository = Repository<MiFlashLike> & MiRepository<MiFlashLike>;
export type UserMemoRepository = Repository<MiUserMemo> & MiRepository<MiUserMemo>;
export type BubbleGameRecordsRepository = Repository<MiBubbleGameRecord> & MiRepository<MiBubbleGameRecord>;
export type ReversiGamesRepository = Repository<MiReversiGame> & MiRepository<MiReversiGame>;
