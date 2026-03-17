import { beforeEach, describe, expect, it } from 'vitest';
import type { DayEntry } from './text-format';
import {
    clearDraftFromStorage,
    readDraftFromStorage,
    writeDraftToStorage,
} from './draft-storage';

const DRAFT_STORAGE_KEY = 'schedules-draft';

class LocalStorageMock {
    private store: Record<string, string> = {};

    clear(): void {
        this.store = {};
    }

    getItem(key: string): string | null {
        return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
    }

    setItem(key: string, value: string): void {
        this.store[key] = String(value);
    }

    removeItem(key: string): void {
        delete this.store[key];
    }
}

describe('draft-storage', () => {
    beforeEach(() => {
        Object.defineProperty(globalThis, 'localStorage', {
            value: new LocalStorageMock(),
            configurable: true,
            writable: true,
        });
    });

    it('writes drafts with date key mapping', () => {
        const entries: DayEntry[] = [
            { dateLabel: '2026/03/20 (金)', content: '0900 standup' },
            { dateLabel: '2026/03/21 (土)', content: '1000 focus' },
        ];

        writeDraftToStorage(entries);

        expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(
            JSON.stringify({
                '2026-03-20': '0900 standup',
                '2026-03-21': '1000 focus',
            })
        );
    });

    it('returns null when draft payload is invalid JSON', () => {
        localStorage.setItem(DRAFT_STORAGE_KEY, '{broken-json');
        expect(readDraftFromStorage()).toBeNull();
    });

    it('clears stored draft key', () => {
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ '2026-03-20': 'x' }));
        clearDraftFromStorage();
        expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
    });
});
