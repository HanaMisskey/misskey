import cluster from 'node:cluster';
import type { Server } from 'node:http';
import { envOption } from '@/env.js';
import { isShutdownInProgress } from '@/boot/shutdown-handler.js';
import { HanaQueueWorkerHealth } from './HanaQueueWorkerHealth.js';
import { HanaWebWorkerHealth, installHanaWebWorkerHealthResponder } from './HanaWebWorkerHealth.js';
import { parseHanaLivenessPort, startHanaLivenessServer } from './HanaLivenessServer.js';

export const hanaQueueWorkerHealth = process.env.HANA_INTERNAL_HEALTH_PORT === undefined ? undefined : new HanaQueueWorkerHealth();
let listening = () => false;
let webStarted = false;
let internalServer: Server | undefined;
let webWorkers: HanaWebWorkerHealth | undefined;
let timer: NodeJS.Timeout | undefined;
let lastCheck = 0;
let clusterLive = false;
let stopped = false;
let disposeResponder: (() => void) | undefined;
let registerWorker: ((worker: cluster.Worker) => void) | undefined;

export function observeHanaWebListener(isListening: () => boolean): void {
	if (process.env.HANA_INTERNAL_HEALTH_PORT === undefined) return;
	listening = isListening;
	webStarted = isListening();
	if (cluster.isWorker) {
		disposeResponder = installHanaWebWorkerHealthResponder({
			channel: {
				on: (event, callback) => process.on(event, callback),
				off: (event, callback) => process.off(event, callback),
				send: message => { if (process.connected) process.send?.(message, () => {}); },
			},
			isListening,
		});
	}
}

export async function initializeHanaLiveness(publicPort: number): Promise<void> {
	const port = parseHanaLivenessPort(process.env.HANA_INTERNAL_HEALTH_PORT, publicPort);
	if (port === undefined) return;
	// A primary-only queue probe would hide the independent consumers in child processes.
	if (!envOption.disableClustering && !envOption.onlyServer) throw new Error('Internal health requires standalone queue processes or a Web cluster');
	if (!envOption.disableClustering) {
		webWorkers = new HanaWebWorkerHealth({
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
	internalServer = await startHanaLivenessServer({
		port,
		isLive: () => {
			if (stopped || isShutdownInProgress()) return false;
			if (webWorkers) return clusterLive && performance.now() - lastCheck < 5000;
			return (envOption.onlyQueue || listening()) && (envOption.onlyServer || hanaQueueWorkerHealth!.isLive());
		},
		isStarted: () => {
			if (stopped || isShutdownInProgress()) return false;
			if (webWorkers) return webWorkers.isStarted();
			return (envOption.onlyQueue || webStarted) && (envOption.onlyServer || hanaQueueWorkerHealth!.isStarted());
		},
	});
}

export async function shutdownHanaLiveness(): Promise<void> {
	if (process.env.HANA_INTERNAL_HEALTH_PORT === undefined) return;
	stopped = true;
	if (timer) clearTimeout(timer);
	if (registerWorker) cluster.off('fork', registerWorker);
	webWorkers?.stop();
	hanaQueueWorkerHealth?.stop();
	disposeResponder?.();
	if (internalServer) {
		internalServer.closeAllConnections();
		await new Promise<void>(resolve => internalServer!.close(() => resolve()));
	}
}
