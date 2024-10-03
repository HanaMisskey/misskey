import { Inject, Injectable } from '@nestjs/common';
import { Stripe } from 'stripe';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import type { UsersRepository, UserProfilesRepository, SubscriptionPlansRepository } from '@/models/_.js';
import { RoleService } from '@/core/RoleService.js';
import { MetaService } from '@/core/MetaService.js';
import { bindThis } from '@/decorators.js';
import { LoggerService } from '@/core/LoggerService.js';
import type Logger from '@/logger.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';

@Injectable()
export class StripeWebhookServerService {
	private logger: Logger;

	constructor(
		@Inject(DI.config)
		private config: Config,
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,
		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,
		@Inject(DI.subscriptionPlansRepository)
		private subscriptionPlansRepository: SubscriptionPlansRepository,

		private roleService: RoleService,
		private metaService: MetaService,
		private userEntityService: UserEntityService,
		private globalEventService: GlobalEventService,
		private loggerService: LoggerService,
	) {
		this.logger = this.loggerService.getLogger('server', 'gray');
	}

	@bindThis
	public createServer(fastify: FastifyInstance, options: FastifyPluginOptions, done: (err?: Error) => void) {
		fastify.addContentTypeParser(
			'application/json',
			{ parseAs: 'buffer' },
			(_req, body, done) => {
				try {
					done(null, body);
				} catch (err: any) {
					err.statusCode = 400;
					return done(err);
				}
			},
		);

		fastify.post('/webhook', { config: { rawBody: true }, bodyLimit: 1024 * 64 }, async (request, reply) => {
			//#region 定義
			const supportedEvents = [
				'customer.subscription.created',
				'customer.subscription.updated',
				'customer.subscription.deleted',
			] as const satisfies (Stripe.Event['type'])[];

			type SupportedEvent = Extract<Stripe.Event, { type: typeof supportedEvents[number] }>;

			function assertIsSupportedEvent(event: Stripe.Event): event is SupportedEvent {
				return (supportedEvents as string[]).includes(event.type);
			}
			//#endregion

			const instance = await this.metaService.fetch(true);

			if (!instance.enableSubscriptions) {
				reply.code(503);
				return;
			}
			if (!(this.config.stripe && this.config.stripe.secretKey && this.config.stripe.webhookSecret)) {
				reply.code(503);
				return;
			}

			const body = request.rawBody;
			if (!body) {
				reply.code(400);
				return;
			}

			// Retrieve the event by verifying the signature using the raw body and secret.
			const signature = request.headers['stripe-signature'];
			if (!signature) { // Check if signature exists.
				reply.code(400);
				return;
			}

			const stripe = new Stripe(this.config.stripe.secretKey);
			let event: Stripe.Event;
			try {
				event = stripe.webhooks.constructEvent(body, signature, this.config.stripe.webhookSecret);
			} catch (err) {
				reply.code(400);
				return;
			}

			if (!assertIsSupportedEvent(event)) {
				this.logger.info(`Unsupported event type: ${event.type}`);
				// 処理できないイベントの場合は処理に入る前に返答してしまう
				reply.code(204);
				return;
			}

			// イベント処理前の共通処理（例：ユーザープロファイルの取得と初期応答の設定）
			const preprocessEvent = async (eventData: SupportedEvent['data']['object']) => {
				const customer = eventData.customer as string;
				const userProfile = await this.userProfilesRepository.findOneBy({ stripeCustomerId: customer });

				if (!userProfile) {
					reply.code(400);
					return;
				}
				reply.code(204); // Stripeへの応答を設定
				return { userProfile, subscription: eventData };
			};

			const res = await preprocessEvent(event.data.object);

			if (!res) {
				return;
			}

			const { userProfile, subscription } = res;

			// Handle the event.
			switch (event.type) {
				case 'customer.subscription.created': { // サブスクリプションが新規に作成された場合
					const subscriptionPlan = await this.subscriptionPlansRepository.findOneByOrFail({ stripePriceId: subscription.items.data[0].plan.id });
					const user = await this.usersRepository.findOneByOrFail({ id: userProfile.userId });

					if (user.stripeSubscriptionId != null) {
						return; // 既にサブスクリプションが存在する場合は何もしない
					}

					if (subscription.status === 'active') {
						await this.roleService.getUserRoles(userProfile.userId).then(async (roles) => {
							// ユーザーにロールが割り当てられていない場合、ロールを割り当てる
							if (!roles.some((role) => role.id === subscriptionPlan.roleId)) {
								await this.roleService.assign(userProfile.userId, subscriptionPlan.roleId);
							}
						});
					}

					await this.usersRepository.update({ id: userProfile.userId }, {
						subscriptionStatus: subscription.status,
						subscriptionPlanId: subscriptionPlan.id,
						stripeSubscriptionId: subscription.id,
					});

					// Publish meUpdated event
					this.globalEventService.publishMainStream(userProfile.userId, 'meUpdated', await this.userEntityService.pack(userProfile.userId, { id: userProfile.userId }, {
						schema: 'MeDetailed',
						includeSecrets: true,
					}));

					return;
				}

				case 'customer.subscription.updated': { // Update the subscription.
					const previousData = event.data.previous_attributes;
					const user = await this.usersRepository.findOneByOrFail({ id: userProfile.userId });
					const subscriptionPlan = await this.subscriptionPlansRepository.findOneByOrFail({ stripePriceId: subscription.items.data[0].plan.id });

					if (user.stripeSubscriptionId && user.stripeSubscriptionId !== subscription.id) { // 既存のサブスクリプションIDとイベントのサブスクリプションIDが一致しない場合は何もしない
						return;
					}

					if (subscription.status === 'active') {
						if (!user.subscriptionPlanId) { // サブスクリプションプランが新規に設定された場合
							const roleIds = (await this.subscriptionPlansRepository.find()).map(x => x.roleId);
							await this.roleService.getUserRoles(user.id).then(async (roles) => {
								for (const role of roles) {
									if (roleIds.includes(role.id) && role.id !== subscriptionPlan.roleId) {
										await this.roleService.unassign(user.id, role.id); // 他のサブスクリプションプランのロールが割り当てられている場合、ロールを解除する
									}
								}

								// ユーザーにロールが割り当てられていない場合、ロールを割り当てる
								if (!roles.some((role) => role.id === subscriptionPlan.roleId)) {
									await this.roleService.assign(user.id, subscriptionPlan.roleId);
								}
							});
						} else if (subscriptionPlan.id !== user.subscriptionPlanId) { // サブスクリプションプランが変更された場合
							const oldSubscriptionPlan = await this.subscriptionPlansRepository.findOneByOrFail({ id: user.subscriptionPlanId ?? undefined });
							await this.roleService.getUserRoles(user.id).then(async (roles) => {
								// 旧サブスクリプションプランのロールが割り当てられている場合、ロールを解除する
								if (roles.some((role) => role.id === oldSubscriptionPlan.roleId)) {
									await this.roleService.unassign(user.id, oldSubscriptionPlan.roleId);
								}
	
								// 新しいサブスクリプションプランのロールが割り当てられていない場合、ロールを割り当てる
								if (!roles.some((role) => role.id === subscriptionPlan.roleId)) {
									await this.roleService.assign(user.id, subscriptionPlan.roleId);
								}
							});
						} else if (previousData && previousData.status) { // サブスクリプションステータスが変更された場合
							await this.roleService.getUserRoles(user.id).then(async (roles) => {
								// ユーザーにロールが割り当てられていない場合、ロールを割り当てる
								if (!roles.some((role) => role.id === subscriptionPlan.roleId)) {
									await this.roleService.assign(user.id, subscriptionPlan.roleId);
								}
							});
						}
					} else if (subscription.cancel_at_period_end) {
						return; // キャンセルされた場合は期限切れのタイミングでcustomer.subscription.deletedイベントが発生するので、ここでは何もしない
					}

					// ユーザーのサブスクリプションステータスとサブスクリプションプランを更新する
					await this.usersRepository.update({ id: user.id }, {
						subscriptionStatus: subscription.status,
						subscriptionPlanId: subscription.status !== 'incomplete_expired' ? subscriptionPlan.id : null,
						stripeSubscriptionId: subscription.status !== 'incomplete_expired' ? user.stripeSubscriptionId ? undefined : subscription.id : null,
					});

					// Publish meUpdated event
					this.globalEventService.publishMainStream(user.id, 'meUpdated', await this.userEntityService.pack(user.id, user, {
						schema: 'MeDetailed',
						includeSecrets: true,
					}));

					return;
				}

				case 'customer.subscription.deleted': { // Delete the subscription.
					const subscriptionPlan = await this.subscriptionPlansRepository.findOneByOrFail({ stripePriceId: subscription.items.data[0].plan.id });
					const user = await this.usersRepository.findOneByOrFail({ id: userProfile.userId });

					if (user.stripeSubscriptionId && user.stripeSubscriptionId !== subscription.id) { // 既存のサブスクリプションIDとイベントのサブスクリプションIDが一致しない場合は何もしない
						return;
					}

					// サブスクリプションプランのロールが割り当てられている場合、ロールを解除する
					await this.roleService.getUserRoles(userProfile.userId).then(async (roles) => {
						if (roles.some((role) => role.id === subscriptionPlan.roleId)) {
							await this.roleService.unassign(userProfile.userId, subscriptionPlan.roleId);
						}
					});

					await this.usersRepository.update({ id: userProfile.userId }, {
						subscriptionStatus: subscription.status,
						subscriptionPlanId: null,
						stripeSubscriptionId: null,
					});

					// Publish meUpdated event
					this.globalEventService.publishMainStream(userProfile.userId, 'meUpdated', await this.userEntityService.pack(userProfile.userId, { id: userProfile.userId }, {
						schema: 'MeDetailed',
						includeSecrets: true,
					}));

					return;
				}

				default: {
					// Unhandled event type.
					reply.code(204);
					return;
				}
			}
		});

		done();
	}
}
