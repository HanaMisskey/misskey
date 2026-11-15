import { afterEach, describe, expect, test, vi } from 'vitest';
import { captureHanamiDeviceContext } from '@/utility/hanami-device-context.js';

const unknownContext = { deviceClass: 'unknown', viewportClass: 'unknown', primaryPointer: 'unknown' };

function environment(input: { userAgent?: string; platform?: string; maxTouchPoints?: number; mobile?: boolean; width?: number; pointer?: 'coarse' | 'fine' | 'none' }) {
	const getHighEntropyValues = vi.fn(() => { throw new Error('High entropy is outside the observation contract'); });
	vi.stubGlobal('navigator', {
		userAgent: input.userAgent ?? '', platform: input.platform ?? '', maxTouchPoints: input.maxTouchPoints ?? 0,
		...(input.mobile === undefined ? {} : { userAgentData: { mobile: input.mobile, getHighEntropyValues } }),
	});
	vi.stubGlobal('innerWidth', input.width);
	vi.stubGlobal('matchMedia', input.pointer === undefined ? undefined : (query: string) => ({ matches: query === `(pointer: ${input.pointer})` }));
	return { getHighEntropyValues };
}

afterEach(() => { vi.unstubAllGlobals(); });

/** Oracle: 端末文脈契約（2026-11-09）§1の優先順と固定境界。UAは粗い推定だけに使い、画面幅・主pointerは別軸で保持する。表の期待値は製品の分類関数から生成しない。 */
describe('coarse current browser context', () => {
	test.each([
		{ name: 'iPhone portrait', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148', width: 390, pointer: 'coarse' as const, deviceClass: 'mobile', viewportClass: 'compact' },
		{ name: 'iPhone landscape', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148', width: 844, pointer: 'coarse' as const, deviceClass: 'mobile', viewportClass: 'medium' },
		{ name: 'Android mobile', userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Mobile Safari/537.36', width: 412, pointer: 'coarse' as const, deviceClass: 'mobile', viewportClass: 'compact' },
		{ name: 'Android tablet', userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Safari/537.36', width: 1280, pointer: 'coarse' as const, deviceClass: 'tablet', viewportClass: 'wide' },
		{ name: 'iPad before mobile UA marker', userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0) Mobile/15E148', mobile: true, width: 820, pointer: 'fine' as const, deviceClass: 'tablet', viewportClass: 'medium' },
		{ name: 'Tablet marker before UAData mobile', userAgent: 'Tablet Mobi', mobile: true, width: 800, pointer: 'coarse' as const, deviceClass: 'tablet', viewportClass: 'medium' },
		{ name: 'iPadOS Macintosh UA', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari/605.1.15', maxTouchPoints: 5, width: 1024, pointer: 'coarse' as const, deviceClass: 'tablet', viewportClass: 'wide' },
		{ name: 'iPadOS MacIntel platform', userAgent: '', platform: 'MacIntel', maxTouchPoints: 2, width: 810, pointer: 'fine' as const, deviceClass: 'tablet', viewportClass: 'medium' },
		{ name: 'UAData mobile without identifying UA', userAgent: '', mobile: true, width: 390, pointer: 'coarse' as const, deviceClass: 'mobile', viewportClass: 'compact' },
		{ name: 'UAData false is not desktop evidence', userAgent: 'Unidentified client', mobile: false, width: 1920, pointer: 'fine' as const, deviceClass: 'unknown', viewportClass: 'wide' },
		{ name: 'narrow Windows PC', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', width: 500, pointer: 'fine' as const, deviceClass: 'desktop', viewportClass: 'compact' },
		{ name: 'touchscreen Windows PC', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', maxTouchPoints: 10, width: 1400, pointer: 'coarse' as const, deviceClass: 'desktop', viewportClass: 'wide' },
		{ name: 'Mac with one touch point', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', maxTouchPoints: 1, width: 800, pointer: 'fine' as const, deviceClass: 'desktop', viewportClass: 'medium' },
		{ name: 'Linux PC without a pointer', userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', width: 1024, pointer: 'none' as const, deviceClass: 'desktop', viewportClass: 'wide' },
	])('classifies $name without exposing source details', input => {
		const boundary = environment(input);
		expect(captureHanamiDeviceContext()).toStrictEqual({ deviceClass: input.deviceClass, viewportClass: input.viewportClass, primaryPointer: input.pointer });
		expect(boundary.getHighEntropyValues).not.toHaveBeenCalled();
	});

	test.each([
		[0.5, 'compact'], [599.99, 'compact'], [600, 'medium'], [1023.99, 'medium'], [1024, 'wide'],
		[0, 'unknown'], [-1, 'unknown'], [NaN, 'unknown'], [Infinity, 'unknown'], [undefined, 'unknown'],
	])('classifies CSS width %s as %s', (width, viewportClass) => {
		environment({ width: width as number | undefined });
		expect(captureHanamiDeviceContext()).toStrictEqual({ ...unknownContext, viewportClass });
	});

	test('keeps unsupported browser APIs and unmatched media queries unknown', () => {
		environment({});
		expect(captureHanamiDeviceContext()).toStrictEqual(unknownContext);
		vi.stubGlobal('matchMedia', () => ({ matches: false }));
		expect(captureHanamiDeviceContext()).toStrictEqual(unknownContext);
		vi.stubGlobal('navigator', undefined);
		expect(captureHanamiDeviceContext()).toStrictEqual(unknownContext);
	});

	test('captures each current window size while preserving the inferred desktop class', () => {
		environment({ userAgent: 'Windows NT 10.0', width: 1280, pointer: 'fine' });
		const wide = captureHanamiDeviceContext();
		vi.stubGlobal('innerWidth', 500);
		const compact = captureHanamiDeviceContext();
		expect(wide).toStrictEqual({ deviceClass: 'desktop', viewportClass: 'wide', primaryPointer: 'fine' });
		expect(compact).toStrictEqual({ deviceClass: 'desktop', viewportClass: 'compact', primaryPointer: 'fine' });
		expect(compact).not.toBe(wide);
	});
});
