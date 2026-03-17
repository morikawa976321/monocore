import type { DayEntry } from './text-format';
import { dateLabelToDateStr } from './text-format';

const DRAFT_STORAGE_KEY = 'schedules-draft';

/** 日付別の下書きコンテンツを localStorage に保存する。 */
export function writeDraftToStorage(entries: DayEntry[]): void {
    try {
        const draft: Record<string, string> = {};
        for (const e of entries) {
            const dateStr = dateLabelToDateStr(e.dateLabel);
            if (dateStr) draft[dateStr] = e.content;
        }
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch {
        // localStorage full or unavailable
    }
}

/** localStorage から日付別の下書きを読み取り、日付文字列をキーとするオブジェクトで返す。 */
export function readDraftFromStorage(): Record<string, string> | null {
    try {
        const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as Record<string, string>;
    } catch {
        return null;
    }
}

/** localStorage の下書きを削除する。 */
export function clearDraftFromStorage(): void {
    try {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
        /**/
    }
}
