import ms from 'ms';
import { Stripe } from 'stripe';
import { Inject, Injectable } from '@nestjs/common';
import type { UsersRepository, UserProfilesRepository, SubscriptionPlansRepository } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { MetaService } from '@/core/MetaService.js';
import type { Config } from '@/config.js';
import { RoleService } from '@/core/RoleService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['subscription'],

	requireCredential: true,
	kind: 'write:account',

	limit: {
		duration: ms('1hour'),
		max: 10,
		minInterval: ms('1sec'),
	},

	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '6a27f458-92aa-4807-bbc3-3b8223a84a7e',
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

		unavailable: {
			message: 'Subscription unavailable.',
			code: 'UNAVAILABLE',
			id: 'ca50e7c1-2589-4360-a338-e729100af0c4',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
	},
	required: [],
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
	) {
		super(meta, paramDef, async (ps, me) => {
			const instance = await this.metaService.fetch(true);
			if (!(instance.enableSubscriptions)) {
				throw new ApiError(meta.errors.unavailable);
			}
			if (!(this.config.stripe && this.config.stripe.secretKey)) {
				throw new ApiError(meta.errors.unavailable);
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
				const makeCustomer = await stripe.customers.create({
					email: userProfile.email,
				});
				await this.userProfilesRepository.update({ userId: user.id }, {
					stripeCustomerId: makeCustomer.id,
				});
				userProfile = await this.userProfilesRepository.findOneByOrFail({ userId: user.id });
				customerId = makeCustomer.id;
			} else {
				customerId = userProfile.stripeCustomerId;
			}

			const subscriptions = await stripe.subscriptions.list({
				customer: customerId,
			});

			const userRoles = await this.roleService.getUserRoles(user.id);
			const subscriptionRoleIds = (await this.subscriptionPlansRepository.find()).map(x => x.roleId);
			const activeSubscription = subscriptions.data.find(sub => ['active', 'trialing'].includes(sub.status));

			if (activeSubscription) {
				const plan = await this.subscriptionPlansRepository.findOneByOrFail({ stripePriceId: activeSubscription.items.data[0].plan.id });

				// 他のサブスクリプションプランのロールが割り当てられている場合、ロールを解除する
				for (const role of userRoles) {
					if (subscriptionRoleIds.includes(role.id) && role.id !== plan.roleId) {
						await this.roleService.unassign(user.id, role.id);
					}
				}

				// サブスクリプションプランのロールが割り当てられていない場合、割り当てる
				if (!userRoles.some(role => role.id === plan.roleId)) {
					await this.roleService.assign(user.id, plan.roleId);
				}

				// サブスクリプションの状態を更新
				await this.usersRepository.update({ id: userProfile.userId }, {
					subscriptionStatus: activeSubscription.status,
					subscriptionPlanId: plan.id,
					stripeSubscriptionId: activeSubscription.id,
				});
			} else {
				// サブスクリプションプランのロールが割り当てられている場合、ロールを解除する
				for (const role of userRoles) {
					if (subscriptionRoleIds.includes(role.id)) {
						await this.roleService.unassign(user.id, role.id);
					}
				}

				let subscriptionStatus: MiUser['subscriptionStatus'] = 'none';

				const subscription = user.stripeSubscriptionId != null ? subscriptions.data.find(sub => sub.id === user.stripeSubscriptionId) : undefined;

				if (subscription != null) {
					subscriptionStatus = subscription.status;
				}

				// サブスクリプションの状態を削除
				await this.usersRepository.update({ id: userProfile.userId }, {
					subscriptionStatus,
					subscriptionPlanId: null,
					stripeSubscriptionId: null,
				});
			}

			this.globalEventService.publishMainStream(userProfile.userId, 'meUpdated', await this.userEntityService.pack(userProfile.userId, { id: userProfile.userId }, {
				schema: 'MeDetailed',
				includeSecrets: true,
			}));
		});
	}
}
