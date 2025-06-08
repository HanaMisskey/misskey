import { shallowRef } from 'vue';
import { miLocalStorage } from '@/local-storage.js';

const KEY = 'mutedEmojis';

function load(): string[] {
        const value = miLocalStorage.getItem(KEY);
        if (!value) return [];
        try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed : [];
        } catch {
                return [];
        }
}

export const mutedEmojis = shallowRef<string[]>(load());

export function setMutedEmojis(emojis: string[]) {
        mutedEmojis.value = emojis;
        miLocalStorage.setItem(KEY, JSON.stringify(emojis));
}
