import { localTimeToUtc, utcToLocalTime } from '../date';
import type { ReplaceScheduleItem } from '../supabase/queries/schedules';
import type { Database } from '../../types/database.types';

export type ScheduleRow = Database['public']['Tables']['schedules']['Row'];

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'] as const;

export type DayEntry = { dateLabel: string; content: string };

/** "2026/03/01 (日)" → "2026-03-01" */
export function dateLabelToDateStr(dateLabel: string): string {
    const parts = dateLabel.split('/');
    if (parts.length < 3) return '';
    const y = parts[0];
    const m = parts[1].padStart(2, '0');
    const d = parts[2].replace(/\s.*/, '').trim().padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** 行頭が HHMM または HHMM-HHMM か */
export const TIME_LINE_REGEX = /^(\d{4})(-(\d{4}))?(\s*)(.*)$/;

/** 4桁の HHMM 文字列が有効な時v刻かどうかを返す。 */
export function isValidHhmm(hhmm: string): boolean {
    if (hhmm.length !== 4) return false;
    const h = parseInt(hhmm.slice(0, 2), 10);
    const m = parseInt(hhmm.slice(2, 4), 10);
    return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

/**
 * テキストエリア1日分の文字列を ReplaceScheduleItem[] に変換する。
 * 行頭が HHMM または HHMM-HHMM の行でブロックを区切り、1ブロック＝1レコード。
 */
export function dayContentToScheduleItems(
    dateStr: string,
    textareaContent: string,
    timezone: string
): ReplaceScheduleItem[] {
    const lines = textareaContent.split(/\r?\n/);
    const items: ReplaceScheduleItem[] = [];
    let i = 0;
    while (i < lines.length) {
        const m = lines[i].match(TIME_LINE_REGEX);
        if (!m) {
            i++;
            continue;
        }
        const startHhmm = m[1];
        const endHhmm = m[3] ?? null;
        const restOfFirstLine = (m[5] ?? '').trim();
        if (!isValidHhmm(startHhmm) || (endHhmm !== null && !isValidHhmm(endHhmm))) {
            i++;
            continue;
        }
        const activityLines: string[] = [restOfFirstLine];
        i++;
        while (i < lines.length && !TIME_LINE_REGEX.test(lines[i])) {
            activityLines.push(lines[i]);
            i++;
        }
        const activity = activityLines.join('\n').trim();
        if (activity === '') continue;
        const start_at = localTimeToUtc(dateStr, startHhmm, timezone);
        const end_at = endHhmm ? localTimeToUtc(dateStr, endHhmm, timezone) : null;
        items.push({ activity, start_at, end_at });
    }
    return items;
}

/**
 * 1日分の ScheduleRow[] をテキストエリア用の1本の文字列に変換する。
 * dateStr に一致する行のみ対象。
 */
export function scheduleRowsToDayContent(
    rows: ScheduleRow[],
    dateStr: string,
    timezone: string
): string {
    const forDay = rows
        .filter((r) => utcToLocalTime(r.start_at, timezone).date === dateStr)
        .sort((a, b) => (a.start_at < b.start_at ? -1 : 1));
    const parts: string[] = [];
    for (const row of forDay) {
        const start = utcToLocalTime(row.start_at, timezone);
        const end = row.end_at ? utcToLocalTime(row.end_at, timezone) : null;
        const timePrefix = end ? `${start.hhmm}-${end.hhmm}` : start.hhmm;
        const activityLines = (row.activity ?? '').split(/\r?\n/);
        const firstLine = activityLines[0] ?? '';
        const rest = activityLines.slice(1);
        const line1 = `${timePrefix}${firstLine ? ' ' + firstLine : ''}`;
        parts.push(rest.length > 0 ? line1 + '\n' + rest.join('\n') : line1);
    }
    return parts.join('\n');
}

/**
 * content 内に DB に保存されない孤立行（時刻ブロックに属さない非空行）があるか判定する。
 * 空行は無視。時刻行の後続行（継続行）は孤立扱いしない。
 */
export function hasOrphanLines(content: string): boolean {
    const lines = content.split(/\r?\n/);
    let inBlock = false;
    for (const line of lines) {
        const m = line.match(TIME_LINE_REGEX);
        if (m) {
            const startHhmm = m[1];
            const endHhmm = m[3] ?? null;
            if (isValidHhmm(startHhmm) && (endHhmm === null || isValidHhmm(endHhmm))) {
                inBlock = true;
                continue;
            }
            inBlock = false;
            if (line.trim() !== '') return true;
            continue;
        }
        if (!inBlock && line.trim() !== '') return true;
    }
    return false;
}

/**
 * DB から取得したスケジュール行を DayEntry[] にマージして返す。
 * draft がある場合は DB の内容より draft を優先する。
 */
export function mergeSchedulesIntoEntries(
    entries: DayEntry[],
    rows: ScheduleRow[],
    tz: string,
    draft: Record<string, string> | null
): DayEntry[] {
    const byDate = new Map<string, ScheduleRow[]>();
    for (const row of rows) {
        const date = utcToLocalTime(row.start_at, tz).date;
        if (!byDate.has(date)) byDate.set(date, []);
        byDate.get(date)!.push(row);
    }
    return entries.map((e) => {
        const dateStr = dateLabelToDateStr(e.dateLabel);
        const draftContent = dateStr ? draft?.[dateStr] : undefined;
        if (draftContent !== undefined) return { ...e, content: draftContent };
        const dbRows = byDate.get(dateStr) ?? [];
        const content = scheduleRowsToDayContent(dbRows, dateStr, tz);
        return { ...e, content };
    });
}

/**
 * 表示用の日付ラベルと空コンテンツを持つ DayEntry の配列を生成する。
 * start から end までの全日を1エントリとして返す。
 */
export function generateDayEntries(start: Date, end: Date): DayEntry[] {
    const entries: DayEntry[] = [];
    const current = new Date(start);
    while (current <= end) {
        const yyyy = current.getFullYear();
        const mm = String(current.getMonth() + 1).padStart(2, '0');
        const dd = String(current.getDate()).padStart(2, '0');
        const dow = DAY_NAMES[current.getDay()];
        entries.push({
            dateLabel: `${yyyy}/${mm}/${dd} (${dow})`,
            content: '',
        });
        current.setDate(current.getDate() + 1);
    }
    return entries;
}
