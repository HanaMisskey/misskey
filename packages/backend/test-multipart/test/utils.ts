import * as crypto from 'crypto';
import fetch, { type RequestInit, type Response } from 'node-fetch';
import type * as misskey from 'misskey-js';

export interface UserToken {
	token: string;
}

const CLUSTER_URL = 'https://nginx';

function instanceUrl(instance: 'instance-1' | 'instance-2'): string {
	return `${CLUSTER_URL}/${instance}`;
}

async function fetchApi(
	baseUrl: string,
	endpoint: string,
	params: Record<string, unknown>,
	user?: UserToken,
): Promise<{ status: number; body: any }> {
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	const bodyObj: Record<string, unknown> = { ...params };
	if (user) bodyObj.i = user.token;

	const res = await fetch(`${baseUrl}/api/${endpoint}`, {
		method: 'POST',
		headers,
		body: JSON.stringify(bodyObj),
	});

	const body = res.headers.get('content-type')?.includes('application/json')
		? await res.json()
		: null;

	return { status: res.status, body };
}

// --- Public API ---

/** API call via round-robin load balancer */
export function apiViaLB(endpoint: string, params: Record<string, unknown>, user?: UserToken) {
	return fetchApi(CLUSTER_URL, endpoint, params, user);
}

/** API call to a specific instance */
export function apiTo(instance: 'instance-1' | 'instance-2', endpoint: string, params: Record<string, unknown>, user?: UserToken) {
	return fetchApi(instanceUrl(instance), endpoint, params, user);
}

/** Upload part to a specific instance */
export async function uploadPartTo(
	instance: 'instance-1' | 'instance-2',
	user: UserToken,
	sessionId: string,
	partNumber: number,
	blob: Blob,
): Promise<{ status: number; body: any }> {
	const formData = new FormData();
	formData.append('i', user.token);
	formData.append('sessionId', sessionId);
	formData.append('partNumber', String(partNumber));
	formData.append('file', blob, `part-${partNumber}`);

	const res = await fetch(`${instanceUrl(instance)}/api/drive/files/multipart/upload-part`, {
		method: 'POST',
		body: formData as any,
	});

	const body = res.status !== 204 ? await res.json() : null;
	return { status: res.status, body };
}

/** Upload part via round-robin load balancer */
export async function uploadPartViaLB(
	user: UserToken,
	sessionId: string,
	partNumber: number,
	blob: Blob,
): Promise<{ status: number; body: any }> {
	const formData = new FormData();
	formData.append('i', user.token);
	formData.append('sessionId', sessionId);
	formData.append('partNumber', String(partNumber));
	formData.append('file', blob, `part-${partNumber}`);

	const res = await fetch(`${CLUSTER_URL}/api/drive/files/multipart/upload-part`, {
		method: 'POST',
		body: formData as any,
	});

	const body = res.status !== 204 ? await res.json() : null;
	return { status: res.status, body };
}

/** Create a test user */
export async function signup(params: { username: string }): Promise<misskey.entities.SignupResponse> {
	const res = await apiViaLB('admin/accounts/create', {
		username: params.username,
		password: 'test_password_' + crypto.randomBytes(8).toString('hex'),
	});
	if (res.status !== 200) throw new Error(`Signup failed: ${JSON.stringify(res.body)}`);
	return res.body;
}

/** Generate random blob of given size */
export function generateRandomBlob(size: number): Blob {
	return new Blob([crypto.randomBytes(size)]);
}
