import { localTimeToUtc, utcToLocalTime } from '../date';
import type { ReplaceScheduleItem } from '../supabase/queries/schedules';
import type { Database } from '../../types/database.types';

export type ScheduleRow = Database['public']['Tables']['schedules']['Row'];

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'] as const;

export type DayEntry = { dateLabel: string; content: string; revision: number };

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
 * 予定の内容が名前を「語として」含むか。名前の前後が行頭・行末か空白（スペース・改行）のときだけ
 * 当たる。"xyz" に対して "xyz" "xyz abc" は当たり、"xyzabc" "abcxyz" "xyz-abc" は当たらない。
 * 起床・消灯・睡眠の判定がこの規則を使う（本人指定 2026-10-14・2026-10-18。目標の名前にも使っていたが目標は 2026-10-23 に廃止）。
 * 複数行の予定は空白か改行でつながれるので、改行も空白として扱われる。
 */
export function activityMatchesName(activity: string, name: string): boolean {
    if (!name) return false;
    for (let i = activity.indexOf(name); i !== -1; i = activity.indexOf(name, i + 1)) {
        const before = i === 0 || /\s/.test(activity[i - 1]);
        const end = i + name.length;
        const after = end === activity.length || /\s/.test(activity[end]);
        if (before && after) return true;
    }
    return false;
}

/**
 * 起床の行か（「起床」を語として含む）。起床の行だけは終了を省ける。保存前の検査と空き時間の計算
 * （free-time.ts）が同じ判定を使わないと、保存できるのに計算では起床にならない行ができる。
 * 「起床時刻の見直し」は起床の行ではなく、「起床。」も起床の行にならない（「起床 。」と書く）。
 */
export function isWakeActivity(activity: string): boolean {
    return activityMatchesName(activity, '起床');
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

export type DayContentIssue = {
    /** 問題のある行の文字列（先頭行）。 */
    line: string;
    kind: 'orphan' | 'missing-end' | 'reversed';
};

/**
 * 1日分のテキストの不正な行を返す。1件でもあればその日は保存しない（useSchedules.saveDay）。
 * - orphan: 時刻ブロックに属さない非空行（DB に保存できない）
 * - missing-end: 起床以外で終了時刻の無い予定（空き時間の計算は全予定の開始・終了を前提にする）
 * - reversed: 終了が開始より前の予定（日付を跨ぐ予定は日ごとに分けて書く）
 */
export function findDayContentIssues(content: string): DayContentIssue[] {
    const lines = content.split(/\r?\n/);
    const issues: DayContentIssue[] = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        const m = line.match(TIME_LINE_REGEX);
        const startHhmm = m?.[1];
        const endHhmm = m?.[3] ?? null;
        if (!m || !startHhmm || !isValidHhmm(startHhmm) || (endHhmm !== null && !isValidHhmm(endHhmm))) {
            if (line.trim() !== '') issues.push({ line, kind: 'orphan' });
            i++;
            continue;
        }
        const activityLines = [(m[5] ?? '').trim()];
        i++;
        while (i < lines.length && !TIME_LINE_REGEX.test(lines[i])) {
            activityLines.push(lines[i]);
            i++;
        }
        const activity = activityLines.join('\n');
        if (endHhmm === null) {
            if (!isWakeActivity(activity)) issues.push({ line, kind: 'missing-end' });
        } else if (endHhmm < startHhmm) {
            issues.push({ line, kind: 'reversed' });
        }
    }
    return issues;
}

/**
 * DB から取得したスケジュール行を DayEntry[] にマージして返す。
 */
export function mergeSchedulesIntoEntries(
    entries: DayEntry[],
    rows: ScheduleRow[],
    tz: string
): DayEntry[] {
    const byDate = new Map<string, ScheduleRow[]>();
    for (const row of rows) {
        const date = utcToLocalTime(row.start_at, tz).date;
        if (!byDate.has(date)) byDate.set(date, []);
        byDate.get(date)!.push(row);
    }
    return entries.map((e) => {
        const dateStr = dateLabelToDateStr(e.dateLabel);
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
            revision: 0,
        });
        current.setDate(current.getDate() + 1);
    }
    return entries;
}
