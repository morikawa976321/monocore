'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { addDays, addMonths, parseISO, format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { createClient } from '@/src/lib/supabase/client';
import { getSchedules, replaceSchedulesForDay } from '@/src/lib/supabase/queries/schedules';
import type { Database } from '@/src/types/database.types';
import { getDefaultTimezone, localTimeToUtc, utcToLocalTime } from '@/src/lib/date';
import { AutoHeightTextarea } from '@/src/components/schedules/AutoHeightTextarea';
import {
    dateLabelToDateStr,
    dayContentToScheduleItems,
    generateDayEntries,
    hasOrphanLines,
    scheduleRowsToDayContent,
    type DayEntry,
} from '@/src/lib/schedules/text-format';
import {
    clearDraftFromStorage,
    readDraftFromStorage,
    writeDraftToStorage,
} from '@/src/lib/schedules/draft-storage';

type ScheduleRow = Database['public']['Tables']['schedules']['Row'];

/** スケジュール一覧・編集ページ。日付ごとのテキストエリアで HHMM 形式の予定を編集し DB に保存する。 */
export default function SchedulesPage() {
    const tz = useMemo(getDefaultTimezone, []);

    const todayStr = useMemo(
        () => format(toZonedTime(new Date(), tz), 'yyyy-MM-dd'),
        [tz]
    );

    const { rangeStart, rangeEnd } = useMemo(() => {
        const today = parseISO(todayStr);
        return {
            rangeStart: addDays(today, -7),
            rangeEnd: addMonths(today, 2),
        };
    }, [todayStr]);

    const [entries, setEntries] = useState<DayEntry[]>(() =>
        generateDayEntries(rangeStart, rangeEnd)
    );
    const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
    const supabase = useMemo(createClient, []);
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSaveTimeRef = useRef<number>(0);
    const entriesRef = useRef<DayEntry[]>(entries);
    entriesRef.current = entries;

    const todaySectionRef = useRef<HTMLElement>(null);

    useEffect(() => {
        todaySectionRef.current?.scrollIntoView({ block: 'start' });
    }, []);

    useEffect(() => {
        const rangeStartUtc = localTimeToUtc(format(rangeStart, 'yyyy-MM-dd'), '0000', tz);
        const rangeEndUtc = localTimeToUtc(format(addDays(rangeEnd, 1), 'yyyy-MM-dd'), '0000', tz);
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
                    clearDraftFromStorage();
                    return fromApi.map((e) => {
                        const dateStr = dateLabelToDateStr(e.dateLabel);
                        const draftContent = dateStr ? draft[dateStr] : undefined;
                        return draftContent !== undefined ? { ...e, content: draftContent } : e;
                    });
                });
            }
        );
    }, [supabase, tz, rangeStart, rangeEnd]);

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

    /** 進行中の保存デバウンスタイマーを停止する。 */
    const clearDebounceTimer = useCallback(() => {
        if (!debounceTimerRef.current) return;
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
    }, []);

    /** 指定インデックスの日の内容を DB に保存する（その日の範囲で replace）。 */
    const saveDay = useCallback((index: number) => {
        const entry = entriesRef.current[index];
        if (!entry) return;
            const dateStr = dateLabelToDateStr(entry.dateLabel);
            if (!dateStr) return;
            const day_start_utc = localTimeToUtc(dateStr, '0000', tz);
            const nextDateStr = format(addDays(parseISO(dateStr), 1), 'yyyy-MM-dd');
            const day_end_utc = localTimeToUtc(nextDateStr, '0000', tz);
            const items = dayContentToScheduleItems(dateStr, entry.content, tz);
            void replaceSchedulesForDay(supabase, day_start_utc, day_end_utc, items).catch(() => {
                writeDraftToStorage(entriesRef.current);
            });
    }, [supabase, tz]);

    /** 指定日のテキストを更新し、フォーカス中ならデバウンスまたは間隔で saveDay を呼ぶ。 */
    const updateDayContent = (index: number, value: string) => {
        setEntries((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], content: value };
            return next;
        });
        if (focusedIndex !== index) return; // フォーカス中のテキストエリアのみ保存スケジュール
        clearDebounceTimer();
        const now = Date.now();
        if (now - lastSaveTimeRef.current >= 10000) {
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
                {entries.map((entry, index) => {
                    const entryDateStr = dateLabelToDateStr(entry.dateLabel);
                    const isToday = entryDateStr === todayStr;
                    return (
                        <section
                            key={entry.dateLabel}
                            ref={isToday ? todaySectionRef : null}
                            className={`rounded-lg bg-white dark:bg-neutral-900 overflow-hidden ${
                                isToday
                                    ? 'border-2 border-amber-500 dark:border-amber-400'
                                    : 'border border-neutral-200 dark:border-neutral-800'
                            }`}
                        >
                            <header className="px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50 font-mono text-sm text-neutral-700 dark:text-neutral-300 flex items-center">
                                <span>{entry.dateLabel}</span>
                                {hasOrphanLines(entry.content) && (
                                    <span className="ml-2 px-1 py-0.5 rounded-sm border border-amber-500 dark:border-amber-400 text-amber-600 dark:text-amber-400 text-sm font-medium leading-none">
                                        Invalid format
                                    </span>
                                )}
                            </header>
                            <div className="p-3">
                                <AutoHeightTextarea
                                    value={entry.content}
                                    onChange={(e) => updateDayContent(index, e.target.value)}
                                    onFocus={() => setFocusedIndex(index)}
                                    onBlur={() => {
                                        setFocusedIndex(null);
                                        clearDebounceTimer();
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
                    );
                })}
            </div>
        </div>
    );
}
