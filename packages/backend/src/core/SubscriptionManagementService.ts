import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import type { Response } from 'node-fetch';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import type { Config } from '@/config.js';
import { MiUser } from '@/models/User.js';

interface SubscriptionPreviewPlan {
  slug: string;
  displayName: string;
  description: string | null;
  monthlyPrice: number;
}

interface SubscribePreview {
	type: 'subscribe';
	currentPlan: null;
	newPlan: SubscriptionPreviewPlan;
	currency: string;
}

interface UpgradePreview {
	type: 'upgrade';
	currentPlan: SubscriptionPreviewPlan;
	newPlan: SubscriptionPreviewPlan;
	amountDue: number;
	credit: number;
	newPlanCharge: number;
	currency: string;
	prorationDate: number;
}

interface DowngradePreview {
	type: 'downgrade';
	currentPlan: SubscriptionPreviewPlan;
	newPlan: SubscriptionPreviewPlan;
	effectiveAt: string;
	currency: string;
}

interface CancelDowngradePreview {
	type: 'cancel_downgrade';
	currentPlan: SubscriptionPreviewPlan;
	newPlan: SubscriptionPreviewPlan;
	pendingDowngradePlan: SubscriptionPreviewPlan;
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

interface SubscriptionErrorResponse {
	error?: string;
	message?: string;
	requestId?: string;
}

const SUBSCRIPTION_SESSION_TTL = 120; // seconds

const SUBSCRIPTION_ERROR_ID_MAP: Record<string, string> = {
	no_active_subscription: '3f4b2f7a-7e87-4fb4-92a9-8c7a2f6f2cb5',
	current_plan_not_found: '6d7c6d1b-6b2f-4f2b-9a48-1b4ef6c8fefb',
	target_plan_not_found: '1c2e8d53-4f66-4c5f-9b6a-0b3f4322e5b8',
	same_plan: '54f0b3a6-3f64-4a8d-8e6a-3e8b15c6f9af',
	same_tier: '9d7e7a9d-1df4-4e64-8b8c-9c3b3f9d9e8a',
	not_an_upgrade: '2c1a4b95-3f5d-4e03-9d26-0c6f17af8f78',
	not_a_downgrade: 'b1a5f2a4-2f7b-4f0b-9a3a-8f6f28d6c8b7',
	no_pending_downgrade: 'f9f1b0b8-3d52-4c1b-8f57-2a4b78f2cfb1',
	stripe_price_not_found: '0f8d8f6a-2a1b-4ed2-9c47-6a4f0c5c9f2e',
	no_subscription_items: '7e5b9f7c-6c4b-4a2e-9e8f-6b3a1c2f5a7b',
	invalid_request: 'e6c1a4a5-2e5a-4c9a-8e4f-7b6a2c9f3d1e',
	missing_target_plan: '8c2a5f6e-3d7a-4b3f-9f6d-1c2b5e7f9a3d',
	missing_return_url: 'd2c9b8a1-5f6e-4f2a-9b8c-3a1d5f7e9c2b',
	invalid_return_url: '4a3e6f8b-2c5d-4f9a-8b7c-1d3e5f7a9c4b',
	downgrade_already_pending: 'b5a7c9d2-6e4f-4b2a-9c3d-5f7e1a2b4c6d',
	schedule_already_exists: 'c7d2a5b9-4e6f-4c2b-8a3d-7f1e5b2c9d4a',
};

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
			throw new IdentifiableError('f4b8c624-4d20-4d14-a247-590d6251e5ce', 'Hanami Billing is not configured.');
		}
		return this.config.hanamiBilling.apiKey;
	}

	@bindThis
	private async throwSubscriptionError(res: Response, fallbackId: string, fallbackMessage: string): Promise<never> {
		const errorText = await res.text();
		let errorCode: string | undefined;
		let errorMessage: string | undefined;
		try {
			const parsed = JSON.parse(errorText) as SubscriptionErrorResponse;
			errorCode = parsed.error;
			errorMessage = parsed.message;
		} catch {
			// Ignore parse errors and fall back to raw text.
		}

		if (errorCode && SUBSCRIPTION_ERROR_ID_MAP[errorCode]) {
			throw new IdentifiableError(
				SUBSCRIPTION_ERROR_ID_MAP[errorCode],
				errorMessage ?? `Hanami Billing error: ${errorCode}`,
			);
		}

		throw new IdentifiableError(
			fallbackId,
			`${fallbackMessage}: ${res.status} ${errorText}`,
		);
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
		}, { throwErrorWhenResponseNotOk: false });

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
		}, { throwErrorWhenResponseNotOk: false });

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
		}, { throwErrorWhenResponseNotOk: false });

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
		}, { throwErrorWhenResponseNotOk: false });

		if (!res.ok) {
			await this.throwSubscriptionError(res, '2d6b32d2-8e3b-487c-a238-b788ee0e4b68', 'Failed to start subscription change session');
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
		}, { throwErrorWhenResponseNotOk: false });

		if (!res.ok) {
			await this.throwSubscriptionError(res, 'a64f0d08-0692-4772-b7fb-3a7bca1ae490', 'Failed to execute subscription change session');
		}

		const { requestId, ...resJson } = await res.json() as SubscriptionChangeResponse;

		return resJson;
	}

	@bindThis
	public async startPlanCancelSession(userId: MiUser['id'], immediate: boolean): Promise<{
		sessionId: string;
		preview: {
			currentPlan: SubscriptionPreviewPlan;
			newPlan: null;
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
		}, { throwErrorWhenResponseNotOk: false });

		if (!res.ok) {
			await this.throwSubscriptionError(res, 'c24f07c2-6f78-4d94-8a13-ffb3e1a0cb9d', 'Failed to start subscription cancel session');
		}

		const resJson = await res.json() as {
			type: 'cancel';
			currentPlan: SubscriptionPreviewPlan;
			newPlan: null;
			effectiveAt: string;
			immediate: boolean;
			requestId: string;
		};

		await this.redisClient.setex(`hanamiSubscriptionCancelPreview:${userId}`, SUBSCRIPTION_SESSION_TTL, JSON.stringify({
			sessionId,
			immediate,
		})); // 2m

		return {
			sessionId,
			preview: {
				currentPlan: resJson.currentPlan,
				newPlan: null,
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
		}, { throwErrorWhenResponseNotOk: false });

		if (!res.ok) {
			await this.throwSubscriptionError(res, '336b8c70-d607-43ea-bd3c-f05e3a7596ef', 'Failed to execute subscription cancel session');
		}
	}
}

export const subscriptionPreviewPlanSchema = {
	type: 'object',
	properties: {
		slug: { type: 'string' },
		displayName: { type: 'string' },
		description: { type: 'string', nullable: true },
		monthlyPrice: { type: 'number' },
	},
	required: ['slug', 'displayName', 'description', 'monthlyPrice'],
} as const;
