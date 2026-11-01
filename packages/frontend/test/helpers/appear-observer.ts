/** Browser API double for the real appear directive. New observations receive the current viewport state, including a still-visible target after Vue remounts it. This does not emulate browser geometry or scrolling layout. */
export class AppearObserver implements IntersectionObserver {
	static instances: AppearObserver[] = [];
	static visible = false;
	readonly root = null;
	readonly rootMargin = '0px';
	readonly thresholds = [0];
	readonly targets = new Set<Element>();

	constructor(private callback: IntersectionObserverCallback) {
		AppearObserver.instances.push(this);
	}

	observe(target: Element): void {
		this.targets.add(target);
		queueMicrotask(() => this.deliver());
	}

	unobserve(target: Element): void { this.targets.delete(target); }
	disconnect(): void { this.targets.clear(); }
	takeRecords(): IntersectionObserverEntry[] { return []; }

	private deliver(): void {
		const entries = [...this.targets].filter(target => target.isConnected).map(target => ({
			target, isIntersecting: AppearObserver.visible, intersectionRatio: AppearObserver.visible ? 1 : 0,
			time: performance.now(), boundingClientRect: target.getBoundingClientRect(),
			intersectionRect: target.getBoundingClientRect(), rootBounds: null,
		}));
		if (entries.length > 0) this.callback(entries, this);
	}

	static viewport(visible: boolean): void {
		this.visible = visible;
		for (const observer of this.instances) observer.deliver();
	}

	static reset(): void {
		this.instances = [];
		this.visible = false;
	}
}
