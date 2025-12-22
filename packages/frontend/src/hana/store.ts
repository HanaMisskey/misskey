import { markRaw } from 'vue';
import { Pizzax } from '@/lib/pizzax.js';

/**
 * はなみすきー独自のデータ用
 */
export const hanaStore = markRaw(new Pizzax('hanaMain', {
	neverShowWelcomeCardPopup: {
		where: 'account',
		default: false,
	},
	lastShowWelcomeCardPopup: {
		where: 'deviceAccount',
		default: 0,
	},
	flowerEffect: {
		where: 'device',
		default: false,
	},
	enableWasmEmojiSearch: {
		where: 'device',
		default: true,
	},
	safeBrowsingConsent: {
		where: 'deviceAccount',
		default: null as boolean | null, // null = 未設定, true = 18歳以上, false = 18歳未満
	},
}));
