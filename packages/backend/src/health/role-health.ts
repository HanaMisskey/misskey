/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import cluster from 'node:cluster';
import type { Server } from 'node:http';
import { envOption } from '@/env.js';
import { isShutdownInProgress } from '@/boot/shutdown-handler.js';
import { QueueWorkerHealth } from './QueueWorkerHealth.js';
import { WebWorkerHealth, installWebWorkerHealthResponder } from './WebWorkerHealth.js';
import { parseInternalHealthPort, startInternalHealthServer } from './internal-health.js';

export const queueWorkerHealth = process.env.MK_INTERNAL_HEALTH_PORT === undefined ? undefined : new QueueWorkerHealth();
let listening = () => false;
let webStarted = false;
let internalServer: Server | undefined;
let webWorkers: WebWorkerHealth | undefined;
let timer: NodeJS.Timeout | undefined;
let lastCheck = 0;
let clusterLive = false;
let stopped = false;
let disposeResponder: (() => void) | undefined;
let registerWorker: ((worker: cluster.Worker) => void) | undefined;

export function observeWebListener(isListening: () => boolean): void {
	if (process.env.MK_INTERNAL_HEALTH_PORT === undefined) return;
	listening = isListening;
	webStarted = isListening();
	if (cluster.isWorker) {
		disposeResponder = installWebWorkerHealthResponder({
			channel: {
				on: (event, callback) => process.on(event, callback),
				off: (event, callback) => process.off(event, callback),
				send: message => { if (process.connected) process.send?.(message, () => {}); },
			},
			isListening,
		});
	}
}

export async function initializeRoleHealth(publicPort: number): Promise<void> {
	const port = parseInternalHealthPort(process.env.MK_INTERNAL_HEALTH_PORT, publicPort);
	if (port === undefined) return;
	// A primary-only queue probe would hide the independent consumers in child processes.
	if (!envOption.disableClustering && !envOption.onlyServer) throw new Error('Internal health requires standalone queue processes or a Web cluster');
	if (!envOption.disableClustering) {
		webWorkers = new WebWorkerHealth({
			timeoutMs: 2000,
			restart: worker => {
				const current = cluster.workers?.[worker.id];
				if (!isShutdownInProgress() && !stopped && current === worker) current.kill('SIGKILL');
			},
		});
		registerWorker = worker => { webWorkers?.register(worker); };
		cluster.on('fork', registerWorker);
		for (const worker of Object.values(cluster.workers ?? {})) if (worker) registerWorker(worker);
		const check = async () => {
			clusterLive = await webWorkers!.check();
			lastCheck = performance.now();
			if (!stopped) {
				timer = setTimeout(() => { void check(); }, 1000);
				timer.unref();
			}
		};
		void check();
	}
	internalServer = await startInternalHealthServer({
		port,
		isLive: () => {
			if (stopped || isShutdownInProgress()) return false;
			if (webWorkers) return clusterLive && performance.now() - lastCheck < 5000;
			return (envOption.onlyQueue || listening()) && (envOption.onlyServer || queueWorkerHealth!.isLive());
		},
		isStarted: () => {
			if (stopped || isShutdownInProgress()) return false;
			if (webWorkers) return webWorkers.isStarted();
			return (envOption.onlyQueue || webStarted) && (envOption.onlyServer || queueWorkerHealth!.isStarted());
		},
	});
}

export async function shutdownRoleHealth(): Promise<void> {
	if (process.env.MK_INTERNAL_HEALTH_PORT === undefined) return;
	stopped = true;
	if (timer) clearTimeout(timer);
	if (registerWorker) cluster.off('fork', registerWorker);
	webWorkers?.stop();
	queueWorkerHealth?.stop();
	disposeResponder?.();
	if (internalServer) {
		internalServer.closeAllConnections();
		await new Promise<void>(resolve => internalServer!.close(() => resolve()));
	}
}
