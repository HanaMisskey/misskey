import { markRaw } from 'vue';
import { Storage } from '@/pizzax.js';

/**
 * はなみすきー独自のデータ用
 */
export const hanaStore = markRaw(new Storage('hanaMain', {
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
}));
