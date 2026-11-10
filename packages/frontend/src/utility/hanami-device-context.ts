export type HanamiDeviceContext = {
	deviceClass: 'mobile' | 'tablet' | 'desktop' | 'unknown';
	viewportClass: 'compact' | 'medium' | 'wide' | 'unknown';
	primaryPointer: 'coarse' | 'fine' | 'none' | 'unknown';
};

export function captureHanamiDeviceContext(): HanamiDeviceContext {
	const browser = typeof navigator === 'undefined' ? undefined : navigator as Navigator & { userAgentData?: { mobile?: boolean } };
	const userAgent = browser?.userAgent ?? '';
	let deviceClass: HanamiDeviceContext['deviceClass'] = 'unknown';
	if (/iPad|Tablet/i.test(userAgent) || (/Macintosh|MacIntel/i.test(`${userAgent} ${browser?.platform ?? ''}`) && (browser?.maxTouchPoints ?? 0) > 1)) {
		deviceClass = 'tablet';
	} else if (browser?.userAgentData?.mobile === true || /Mobi|iPhone|iPod/i.test(userAgent)) {
		deviceClass = 'mobile';
	} else if (/Android/i.test(userAgent)) {
		deviceClass = 'tablet';
	} else if (/Windows NT|Macintosh|X11/i.test(userAgent)) {
		deviceClass = 'desktop';
	}

	const width = typeof window === 'undefined' ? undefined : window.innerWidth;
	const viewportClass = typeof width === 'number' && Number.isFinite(width) && width > 0
		? width < 600 ? 'compact' : width < 1024 ? 'medium' : 'wide'
		: 'unknown';
	const primaryPointer = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
		? (['coarse', 'fine', 'none'] as const).find(pointer => window.matchMedia(`(pointer: ${pointer})`).matches) ?? 'unknown'
		: 'unknown';
	return { deviceClass, viewportClass, primaryPointer };
}
