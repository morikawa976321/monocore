'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { addDays, parseISO, format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { createClient } from '@/src/lib/supabase/client';
import { getSchedules, replaceSchedulesForDay } from '@/src/lib/supabase/queries/schedules';
import type { ReplaceScheduleItem } from '@/src/lib/supabase/queries/schedules';
import type { Database } from '@/src/types/database.types';
import { getDefaultTimezone, localTimeToUtc, utcToLocalTime } from '@/src/lib/date';

type ScheduleRow = Database['public']['Tables']['schedules']['Row'];

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

type DayEntry = { dateLabel: string; content: string };

/** "2026/03/01 (日)" → "2026-03-01" */
function dateLabelToDateStr(dateLabel: string): string {
    const parts = dateLabel.split('/');
    if (parts.length < 3) return '';
    const y = parts[0];
    const m = parts[1].padStart(2, '0');
    const d = parts[2].replace(/\s.*/, '').trim().padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** 行頭が HHMM または HHMM-HHMM か */
const TIME_LINE_REGEX = /^(\d{4})(-(\d{4}))?(\s*)(.*)$/;

/** 4桁の HHMM 文字列が有効な時刻かどうかを返す。 */
function isValidHhmm(hhmm: string): boolean {
    if (hhmm.length !== 4) return false;
    const h = parseInt(hhmm.slice(0, 2), 10);
    const m = parseInt(hhmm.slice(2, 4), 10);
    return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

/**
 * テキストエリア1日分の文字列を ReplaceScheduleItem[] に変換する。
 * 行頭が HHMM または HHMM-HHMM の行でブロックを区切り、1ブロック＝1レコード。
 */
function dayContentToScheduleItems(
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
function scheduleRowsToDayContent(
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

const FIXED_TODAY = new Date(2026, 2, 1);
const FIXED_END = new Date(2027, 10, 15);

/** 表示用の日付ラベルと空コンテンツを持つ DayEntry の配列を生成する。 */
function generateDayEntries(): DayEntry[] {
    // TODO: 無限スクロールを実装する（上はデフォルトで2週間前、下は半年先まで表示。交差監視方式により実装）
    const today = FIXED_TODAY;
    const end = FIXED_END;

    const entries: DayEntry[] = [];
    const current = new Date(today);

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

const INITIAL_ENTRIES = generateDayEntries();

const DRAFT_STORAGE_KEY = 'schedules-draft';

/** 日付別の下書きコンテンツを localStorage に保存する。 */
function writeDraftToStorage(entries: DayEntry[]): void {
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
function readDraftFromStorage(): Record<string, string> | null {
    try {
        const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as Record<string, string>;
    } catch {
        return null;
    }
}

/** 内容に応じて高さが自動調整される textarea。 */
function AutoHeightTextarea({
    value,
    onChange,
    className,
    ...props
}: React.ComponentPropsWithoutRef<'textarea'>) {
    const ref = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const ta = ref.current;
        if (!ta) return;
        ta.style.height = 'auto';
        const str = typeof value === 'string' ? value : '';
        if (str.trim().length > 0) {
            ta.style.height = ta.scrollHeight + 'px';
        }
    }, [value]);

    return (
        <textarea
            ref={ref}
            value={value}
            onChange={onChange}
            className={className}
            style={{ overflow: 'hidden' }}
            {...props}
        />
    );
}

/** スケジュール一覧・編集ページ。日付ごとのテキストエリアで HHMM 形式の予定を編集し DB に保存する。 */
export default function SchedulesPage() {
    const [entries, setEntries] = useState<DayEntry[]>(INITIAL_ENTRIES);
    const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
    const supabase = useMemo(createClient, []);
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSaveTimeRef = useRef<number>(0);
    const entriesRef = useRef<DayEntry[]>(entries);
    entriesRef.current = entries;

    const todayStr = useMemo(
        () => format(toZonedTime(new Date(), getDefaultTimezone()), 'yyyy-MM-dd'),
        []
    );

    useEffect(() => {
        const tz = getDefaultTimezone();
        const rangeStartUtc = localTimeToUtc('2026-03-01', '0000', tz);
        const rangeEndUtc = localTimeToUtc('2027-11-16', '0000', tz);
        getSchedules(supabase, rangeStartUtc, rangeEndUtc).then(
            (result: { data: ScheduleRow[] | null; error: Error | null }) => {
                const { data, error } = result;
                if (error || !data) return;
                const byDate = new Map<string, ScheduleRow[]>();
                for (const row of data) {
                    const date = utcToLocalTime(row.start_at, tz).date;
                    if (!byDate.has(date)) byDate.set(date, []);
                    byDate.get(date)!.push(row);
                }
                setEntries((prev) => {
                    const fromApi = prev.map((e) => {
                        const dateStr = dateLabelToDateStr(e.dateLabel);
                        const rows = byDate.get(dateStr) ?? [];
                        const content = scheduleRowsToDayContent(rows, dateStr, tz);
                        return { ...e, content: content || e.content };
                    });
                    const draft = readDraftFromStorage();
                    if (!draft) return fromApi;
                    try {
                        localStorage.removeItem(DRAFT_STORAGE_KEY);
                    } catch {
                        /**/
                    }
                    return fromApi.map((e) => {
                        const dateStr = dateLabelToDateStr(e.dateLabel);
                        const draftContent = dateStr ? draft[dateStr] : undefined;
                        return draftContent !== undefined ? { ...e, content: draftContent } : e;
                    });
                });
            }
        );
    }, [supabase]);

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            writeDraftToStorage(entriesRef.current);
            if (debounceTimerRef.current != null) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            writeDraftToStorage(entriesRef.current);
        };
    }, []);

    /** 指定インデックスの日の内容を DB に保存する（その日の範囲で replace）。 */
    const saveDay = useCallback((index: number) => {
        const entry = entriesRef.current[index];
        if (!entry) return;
            const dateStr = dateLabelToDateStr(entry.dateLabel);
            if (!dateStr) return;
            const tz = getDefaultTimezone();
            const day_start_utc = localTimeToUtc(dateStr, '0000', tz);
            const nextDateStr = format(addDays(parseISO(dateStr), 1), 'yyyy-MM-dd');
            const day_end_utc = localTimeToUtc(nextDateStr, '0000', tz);
            const items = dayContentToScheduleItems(dateStr, entry.content, tz);
            replaceSchedulesForDay(supabase, day_start_utc, day_end_utc, items);
    }, [supabase]);

    /** 指定日のテキストを更新し、フォーカス中ならデバウンスまたは間隔で saveDay を呼ぶ。 */
    const updateDayContent = (index: number, value: string) => {
        setEntries((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], content: value };
            return next;
        });
        if (focusedIndex !== index) return; // フォーカス中のテキストエリアのみ保存スケジュール
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        }
        const now = Date.now();
        if (now - lastSaveTimeRef.current >= 10000) {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
                debounceTimerRef.current = null;
            }
            lastSaveTimeRef.current = now;
            entriesRef.current = entriesRef.current.map((e, i) =>
                i === index ? { ...e, content: value } : e
            );
            saveDay(index);
        } else {
            debounceTimerRef.current = setTimeout(() => {
                debounceTimerRef.current = null;
                lastSaveTimeRef.current = Date.now();
                saveDay(index);
            }, 1000);
        }
    };

    return (
        <div className="flex flex-col h-screen bg-neutral-100 dark:bg-neutral-950">
            {/* Header */}
            <header className="flex items-center px-6 py-3 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 shrink-0">
                <h1 className="text-base font-medium tracking-widest uppercase text-neutral-900 dark:text-neutral-100">
                    Schedules
                </h1>
            </header>

            {/* Day sections */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                {entries.map((entry, index) => (
                    <section
                        key={entry.dateLabel}
                        className={`rounded-lg bg-white dark:bg-neutral-900 overflow-hidden ${
                            dateLabelToDateStr(entry.dateLabel) === todayStr
                                ? 'border-2 border-amber-500 dark:border-amber-400'
                                : 'border border-neutral-200 dark:border-neutral-800'
                        }`}
                    >
                        <header className="px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50 font-mono text-sm text-neutral-700 dark:text-neutral-300">
                            {entry.dateLabel}
                        </header>
                        <div className="p-3">
                            <AutoHeightTextarea
                                value={entry.content}
                                onChange={(e) => updateDayContent(index, e.target.value)}
                                onFocus={() => setFocusedIndex(index)}
                                onBlur={() => {
                                    setFocusedIndex(null);
                                    if (debounceTimerRef.current) {
                                        clearTimeout(debounceTimerRef.current);
                                        debounceTimerRef.current = null;
                                    }
                                    lastSaveTimeRef.current = Date.now();
                                    saveDay(index);
                                }}
                                className={[
                                    'w-full min-h-[4rem] resize-none bg-transparent border-none outline-none',
                                    'font-mono text-base leading-7',
                                    'text-neutral-900 dark:text-neutral-100',
                                    'placeholder:text-neutral-400 dark:placeholder:text-neutral-600',
                                ].join(' ')}
                                spellCheck={false}
                                autoComplete="off"
                                autoCorrect="off"
                                rows={3}
                            />
                        </div>
                    </section>
                ))}
            </div>
        </div>
    );
}
