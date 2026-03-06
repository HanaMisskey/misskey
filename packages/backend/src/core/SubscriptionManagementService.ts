import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import type { Config } from '@/config.js';
import { MiUser } from '@/models/User.js';

interface SubscribePreview {
	type: 'subscribe';
	targetPlanSlug: string;
	targetPlanDisplayName: string;
	targetPlanMonthlyPrice: number;
	currency: string;
}

interface UpgradePreview {
	type: 'upgrade';
	currentPlanSlug: string;
	newPlanSlug: string;
	amountDue: number;
	credit: number;
	newPlanCharge: number;
	currency: string;
	prorationDate: number;
}

interface DowngradePreview {
	type: 'downgrade';
	currentPlanSlug: string;
	newPlanSlug: string;
	effectiveAt: string;
	currentPlanMonthlyPrice: number;
	newPlanMonthlyPrice: number;
	currency: string;
}

interface CancelDowngradePreview {
	type: 'cancel_downgrade';
	currentPlanSlug: string;
	pendingDowngradeTargetSlug: string;
	pendingDowngradeEffectiveAt: string;
}

type SubscriptionPreviewResult =
	| SubscribePreview
	| UpgradePreview
	| DowngradePreview
	| CancelDowngradePreview;

type SubscriptionPreviewResponse = SubscriptionPreviewResult & { requestId: string };

interface SubscriptionChangeSessionData {
	sessionId: string;
	newPlanSlug: string;
	operationType: SubscriptionPreviewResult['type'];
	prorationDate?: number;
}

interface SubscribeExecuteResult {
  type: 'subscribe';
  url: string;
}

interface UpgradeExecuteResult {
  type: 'upgrade';
  subscriptionId: string;
  previousPlanSlug: string;
  newPlanSlug: string;
}

interface DowngradeExecuteResult {
  type: 'downgrade';
  subscriptionId: string;
  scheduleId: string;
  previousPlanSlug: string;
  newPlanSlug: string;
  effectiveAt: string;
}

interface CancelDowngradeExecuteResult {
  type: 'cancel_downgrade';
  subscriptionId: string;
  canceledScheduleId: string;
  currentPlanSlug: string;
}

type SubscriptionChangeResult =
  | SubscribeExecuteResult
  | UpgradeExecuteResult
  | DowngradeExecuteResult
  | CancelDowngradeExecuteResult;

type SubscriptionChangeResponse = SubscriptionChangeResult & { requestId: string };

const SUBSCRIPTION_SESSION_TTL = 120; // seconds

@Injectable()
export class SubscriptionManagementService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		private idService: IdService,
		private httpRequestService: HttpRequestService,
	) {
	}

	/** pathは先頭スラッシュ含める */
	@bindThis
	private getPaymentGatewayUrl(path: string) {
		if (!this.config.hanamiBilling) {
			throw new IdentifiableError('f4b8c624-4d20-4d14-a247-590d6251e5ce', 'Hanami Billing is not configured.');
		}
		return `${this.config.hanamiBilling.host}${path}`;
	}

	@bindThis
	private getApiKey() {
		if (!this.config.hanamiBilling) {
			throw new IdentifiableError('7e1b4c51-0ef8-4d05-b2d6-3e9f8fc4c0b1', 'Hanami Billing is not configured.');
		}
		return this.config.hanamiBilling.apiKey;
	}

	@bindThis
	public async getPlans(): Promise<{
		slug: string;
		displayName: string;
		description: string;
		monthlyPrice: number;
	}[]> {
		const res = await this.httpRequestService.send(this.getPaymentGatewayUrl('/internal/plans'), {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${this.getApiKey()}`,
			},
		});

		if (!res.ok) {
			throw new IdentifiableError('2a11f21c-1e6f-4422-9561-4aab3a213402', `Failed to fetch plans from Hanami Billing: ${res.status} ${await res.text()}`);
		}

		const plans = await res.json() as {
			plans: {
				slug: string;
				displayName: string;
				description: string;
				monthlyPrice: number;
				active: boolean;
			}[];
			requestId: string;
		};

		return plans.plans.filter(plan => plan.active).map(plan => ({
			slug: plan.slug,
			displayName: plan.displayName,
			description: plan.description,
			monthlyPrice: plan.monthlyPrice,
		}));
	}

	@bindThis
	public async getCustomerPortalUrl(userId: MiUser['id'], returnUrl: string): Promise<string> {
		const res = await this.httpRequestService.send(this.getPaymentGatewayUrl('/internal/portal'), {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.getApiKey()}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				misskeyUserId: userId,
				returnUrl,
			}),
		});

		if (!res.ok) {
			throw new IdentifiableError('5c5a0ca6-1fb0-4b7c-83d9-3f30062edc63', `Failed to fetch customer portal URL from Hanami Billing: ${res.status} ${await res.text()}`);
		}

		const { url } = await res.json() as {
			url: string;
			requestId: string;
		};

		return url;
	}

	@bindThis
	public async getSubscriptionStatus(userId: MiUser['id']): Promise<{
		subscription: {
			plan: {
				slug: string;
				displayName: string;
				description: string;
				monthlyPrice: number;
			};
			status: 'incomplete' | 'incomplete_expired' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'paused';
			currentPeriodEnd: string;
			cancelAtPeriodEnd: boolean;
		} | null;
		roleId: string | null;
	}> {
		const res = await this.httpRequestService.send(this.getPaymentGatewayUrl(`/internal/status?misskeyUserId=${encodeURIComponent(userId)}`), {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${this.getApiKey()}`,
			},
		});

		if (!res.ok) {
			throw new IdentifiableError('6a29c1d3-7b47-4f2c-8f35-9002a4f34683', `Failed to fetch subscription status from Hanami Billing: ${res.status} ${await res.text()}`);
		}

		const { subscription, roleId } = await res.json() as {
			subscription: {
				plan: {
					slug: string;
					displayName: string;
					description: string;
					monthlyPrice: number;
				};
				status: 'incomplete' | 'incomplete_expired' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'paused';
				currentPeriodEnd: string;
				cancelAtPeriodEnd: boolean;
			} | null;
			roleId: string | null;
			requestId: string;
		};

		return {
			subscription,
			roleId,
		};
	}

	@bindThis
	public async startPlanChangeSession(userId: MiUser['id'], newPlanSlug: string): Promise<{
		sessionId: string;
		preview: Omit<SubscriptionPreviewResult, 'requestId'>;
	}> {
		const sessionId = this.idService.gen();
		const res = await this.httpRequestService.send(this.getPaymentGatewayUrl('/internal/subscription/preview'), {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.getApiKey()}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				misskeyUserId: userId,
				slug: newPlanSlug,
			}),
		});

		if (!res.ok) {
			throw new IdentifiableError('2d6b32d2-8e3b-487c-a238-b788ee0e4b68', `Failed to start subscription change session: ${res.status} ${await res.text()}`);
		}

		const { requestId, ...resJson } = await res.json() as SubscriptionPreviewResponse;

		await this.redisClient.setex(`hanamiSubscriptionChangePreview:${userId}`, SUBSCRIPTION_SESSION_TTL, JSON.stringify({
			sessionId,
			newPlanSlug,
			operationType: resJson.type,
			prorationDate: 'prorationDate' in resJson ? resJson.prorationDate : undefined,
		})); // 2m

		return {
			sessionId,
			preview: resJson,
		};
	}

	@bindThis
	public async executePlanChangeSession(userId: string, newPlanSlug: string, sessionId: string, returnUrl: string): Promise<SubscriptionChangeResult> {
		const sessionDataStr = await this.redisClient.getdel(`hanamiSubscriptionChangePreview:${userId}`);
		if (!sessionDataStr) {
			throw new IdentifiableError('85c4d10b-6a1a-4b9f-a4b2-4d0f1515b5cf', 'Session not found or expired.');
		}
		const sessionData = JSON.parse(sessionDataStr) as SubscriptionChangeSessionData;

		if (sessionData.sessionId !== sessionId || sessionData.newPlanSlug !== newPlanSlug) {
			throw new IdentifiableError('4d1b36ee-3286-4f1f-8b72-8ed8c1c5c4ab', 'Session data does not match the request.');
		}

		const res = await this.httpRequestService.send(this.getPaymentGatewayUrl('/internal/subscription'), {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.getApiKey()}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				misskeyUserId: userId,
				slug: newPlanSlug,
				returnUrl,
				prorationDate: sessionData.prorationDate,
			}),
		});

		if (!res.ok) {
			throw new IdentifiableError('a64f0d08-0692-4772-b7fb-3a7bca1ae490', `Failed to execute subscription change session: ${res.status} ${await res.text()}`);
		}

		const { requestId, ...resJson } = await res.json() as SubscriptionChangeResponse;

		return resJson;
	}

	@bindThis
	public async startPlanCancelSession(userId: MiUser['id'], immediate: boolean): Promise<{
		sessionId: string;
		preview: {
			currentPlanSlug: string;
			effectiveAt: string;
			immediate: boolean;
		}
	}> {
		const sessionId = this.idService.gen();
		const res = await this.httpRequestService.send(this.getPaymentGatewayUrl('/internal/subscription/cancel/preview'), {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.getApiKey()}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				misskeyUserId: userId,
				immediate,
			}),
		});

		if (!res.ok) {
			throw new IdentifiableError('c24f07c2-6f78-4d94-8a13-ffb3e1a0cb9d', `Failed to start subscription cancel session: ${res.status} ${await res.text()}`);
		}

		const resJson = await res.json() as {
			currentPlanSlug: string;
			effectiveAt: string;
			immediate: boolean;
		};

		await this.redisClient.setex(`hanamiSubscriptionCancelPreview:${userId}`, SUBSCRIPTION_SESSION_TTL, JSON.stringify({
			sessionId,
			immediate,
		})); // 2m

		return {
			sessionId,
			preview: {
				currentPlanSlug: resJson.currentPlanSlug,
				effectiveAt: resJson.effectiveAt,
				immediate: resJson.immediate,
			},
		};
	}

	@bindThis
	public async executePlanCancelSession(userId: string, immediate: boolean, sessionId: string): Promise<void> {
		const sessionDataStr = await this.redisClient.getdel(`hanamiSubscriptionCancelPreview:${userId}`);
		if (!sessionDataStr) {
			throw new IdentifiableError('0c705fa7-86d2-48aa-8b34-1cd4c6e6e1c8', 'Session not found or expired.');
		}
		const sessionData = JSON.parse(sessionDataStr) as {
			sessionId: string;
			immediate: boolean;
		};

		if (sessionData.sessionId !== sessionId || sessionData.immediate !== immediate) {
			throw new IdentifiableError('d7f09f88-3fd1-4cd1-9b53-9f8c0e3b3f72', 'Session data does not match the request.');
		}

		const res = await this.httpRequestService.send(this.getPaymentGatewayUrl('/internal/subscription/cancel'), {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.getApiKey()}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				misskeyUserId: userId,
				immediate: sessionData.immediate,
			}),
		});

		if (!res.ok) {
			throw new IdentifiableError('336b8c70-d607-43ea-bd3c-f05e3a7596ef', `Failed to execute subscription cancel session: ${res.status} ${await res.text()}`);
		}
	}
}
