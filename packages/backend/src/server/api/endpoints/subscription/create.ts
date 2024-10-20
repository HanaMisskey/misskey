import ms from 'ms';
import { Stripe } from 'stripe';
import { Inject, Injectable } from '@nestjs/common';
import type { UsersRepository, UserProfilesRepository, SubscriptionPlansRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { MetaService } from '@/core/MetaService.js';
import type { Config } from '@/config.js';
import { RoleService } from '@/core/RoleService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { ApiError } from '../../error.js';
import { LoggerService } from "@/core/LoggerService.js";

export const meta = {
	tags: ['subscription'],

	requireCredential: true,
	kind: 'write:account',

	limit: {
		duration: ms('1hour'),
		max: 10,
		minInterval: ms('1sec'),
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			redirect: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					permanent: { type: 'boolean', optional: false, nullable: false },
					destination: { type: 'string', optional: false, nullable: false },
				},
			},
		},
	},

	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '6a27f458-92aa-4807-bbc3-3b8223a84a7e',
		},

		noSuchPlan: {
			message: 'No such plan.',
			code: 'NO_SUCH_PLAN',
			id: 'd9f0d5c1-0b5b-4b7a-9d2c-1c1c5c6d1d1d',
		},

		accessDenied: {
			message: 'Access denied.',
			code: 'ACCESS_DENIED',
			id: 'fe8d7103-0ea8-4ec3-814d-f8b401dc69e9',
		},

		requiredEmail: {
			message: 'Email is required.',
			code: 'REQUIRED_EMAIL',
			id: 'f1b0a9f3-9f8a-4e8c-9b4d-0d2c1b7a9c0b',
		},

		statusInconsistency: {
			message: 'The information registered in the payment service and the information stored on the server do not match.',
			code: 'STATUS_INCONSENT',
			id: 'f1d204e7-276a-4277-9e7b-14f5e038c2d8',
		},

		unavailable: {
			message: 'Subscription unavailable.',
			code: 'UNAVAILABLE',
			id: 'ca50e7c1-2589-4360-a338-e729100af0c4',
		},

		sessionInvalid: {
			message: 'Session is invalid.',
			code: 'SESSION_INVALID',
			id: '4cee5674-69de-474d-aea7-00ed3c4fc8d7',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		planId: { type: 'string', format: 'misskey:id' },
	},
	required: ['planId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.config)
		private config: Config,
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,
		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,
		@Inject(DI.subscriptionPlansRepository)
		private subscriptionPlansRepository: SubscriptionPlansRepository,

		private globalEventService: GlobalEventService,
		private userEntityService: UserEntityService,
		private roleService: RoleService,
		private metaService: MetaService,
		private loggerService: LoggerService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const logger = this.loggerService.getLogger('subscription:create');
			const instance = await this.metaService.fetch(true);
			if (!(instance.enableSubscriptions)) {
				throw new ApiError(meta.errors.unavailable);
			}
			if (!(this.config.stripe && this.config.stripe.secretKey)) {
				throw new ApiError(meta.errors.unavailable);
			}

			const plan = await this.subscriptionPlansRepository.findOneBy({ id: ps.planId });
			if (plan?.isArchived || !plan?.stripePriceId) {
				throw new ApiError(meta.errors.noSuchPlan);
			}

			const user = await this.usersRepository.findOneByOrFail({ id: me.id });
			let userProfile = await this.userProfilesRepository.findOneBy({ userId: me.id });
			if (!user || !userProfile) {
				throw new ApiError(meta.errors.noSuchUser);
			}
			if (!userProfile.email) {
				throw new ApiError(meta.errors.requiredEmail);
			}

			const stripe = new Stripe(this.config.stripe.secretKey);
			let customerId: string;
			if (!userProfile.stripeCustomerId) {
				const searchCustomer = await stripe.customers.search({ query: `email:"${userProfile.email}"` });
				if (searchCustomer.data.length !== 0) {
					logger.info(`User with email ${userProfile.email} is already registered in Stripe but not recorded in UserProfile.`);
					throw new ApiError(meta.errors.statusInconsistency);
				}

				const makeCustomer = await stripe.customers.create({
					email: userProfile.email,
				});
				await this.userProfilesRepository.update({ userId: user.id }, {
					stripeCustomerId: makeCustomer.id,
				});
				userProfile = await this.userProfilesRepository.findOneByOrFail({ userId: user.id });
				customerId = makeCustomer.id;
				logger.info(`New Stripe customer created with ID ${makeCustomer.id} and associated with user ${user.id}`);
			} else {
				customerId = userProfile.stripeCustomerId;
			}

			const subscriptionStatus = user.subscriptionStatus;
			if (['active', 'trialing'].includes(subscriptionStatus)) {
				if (plan.id !== user.subscriptionPlanId) {
					// Upgrade or downgrade subscription
					const subscription = await stripe.subscriptions.list({
						customer: customerId,
					});

					if (subscription.data.length === 0) {
						throw new ApiError(meta.errors.accessDenied);
					}

					const oldSubscription = await subscriptionPlansRepository.findOneByOrFail({ id: user.subscriptionPlanId ?? undefined });
					const subscriptionItem = subscription.data
						.filter(d => d.id === user.stripeSubscriptionId)[0].items.data
						.filter(d => d.price.id === oldSubscription.stripePriceId)[0];

					// 同期がとれておらず、サブスクリプションの状態が不正な場合
					if (!subscriptionItem) {
						// FIXME: 不正な状態なのでここに入るのがそもそもおかしい

						// サブスクリプションプランのロールが割り当てられている場合、ロールを解除する
						const roleIds = (await this.subscriptionPlansRepository.find()).map(x => x.roleId);
						await this.roleService.getUserRoles(user.id).then(async (roles) => {
							for (const role of roles) {
								if (roleIds.includes(role.id)) {
									await this.roleService.unassign(user.id, role.id);
									logger.info(`${user.id} has been unassigned the role "${role.id}".`);
								}
							}
						});

						// サブスクリプションの状態を削除
						await this.usersRepository.update({ id: userProfile.userId }, {
							subscriptionStatus: 'none',
							subscriptionPlanId: null,
							stripeSubscriptionId: null,
						});

						this.globalEventService.publishMainStream(userProfile.userId, 'meUpdated', await this.userEntityService.pack(userProfile.userId, { id: userProfile.userId }, {
							schema: 'MeDetailed',
							includeSecrets: true,
						}));

						throw new ApiError(meta.errors.accessDenied);
					}

					await stripe.subscriptionItems.update(subscriptionItem.id, { plan: plan.stripePriceId });
					logger.info(`Subscription plan changed for user ${user.id} to plan ${plan.id}`);

					throw new ApiError(meta.errors.accessDenied);
				} else {
					throw new ApiError(meta.errors.accessDenied);
				}
			} else if (subscriptionStatus === 'incomplete' || subscriptionStatus === 'past_due' || subscriptionStatus === 'unpaid') {
				// 決済ができていない場合
				const session = await stripe.checkout.sessions.create({
					customer: customerId,
					allow_promotion_codes: true,
					return_url: `${this.config.url}/settings/subscription`,
				}, {});

				if (!session.url) throw new ApiError(meta.errors.sessionInvalid);

				return {
					redirect: {
						permanent: false,
						destination: session.url,
					},
				};
			} else {
				// キャンセル、または新規の場合
				const session = await stripe.checkout.sessions.create({
					mode: 'subscription',
					billing_address_collection: 'auto',
					allow_promotion_codes: true,
					line_items: [
						{
							price: plan.stripePriceId,
							quantity: 1,
						},
					],
					success_url: `${this.config.url}/settings/subscription`,
					cancel_url: `${this.config.url}/settings/subscription`,
					customer: customerId,
				});

				if (!session.url) throw new ApiError(meta.errors.sessionInvalid);

				return {
					redirect: {
						permanent: false,
						destination: session.url,
					},
				};
			}

			throw new ApiError(meta.errors.accessDenied);
		});
	}
}
