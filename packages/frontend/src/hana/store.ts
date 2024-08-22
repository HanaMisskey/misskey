import { markRaw } from 'vue';
import { Storage } from '@/pizzax.js';

/**
 * はなみすきー独自のデータ用
 */
export const hanaStore = markRaw(new Storage('hanaMain', {
	flowerEffect: {
		where: 'device',
		default: false,
	},
}));
