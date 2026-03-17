'use client';

import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { addDays, addMonths, subMonths, parseISO, format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { createClient } from '@/src/lib/supabase/client';
import { getSchedules, replaceSchedulesForDay } from '@/src/lib/supabase/queries/schedules';
import { getDefaultTimezone, localTimeToUtc } from '@/src/lib/date';
import { AutoHeightTextarea } from '@/src/components/schedules/AutoHeightTextarea';
import {
    dateLabelToDateStr,
    dayContentToScheduleItems,
    generateDayEntries,
    hasOrphanLines,
    mergeSchedulesIntoEntries,
    type DayEntry,
} from '@/src/lib/schedules/text-format';
import {
    clearDraftFromStorage,
    readDraftFromStorage,
    writeDraftToStorage,
} from '@/src/lib/schedules/draft-storage';

/** スケジュール一覧・編集ページ。双方向無限スクロール対応。 */
export default function SchedulesPage() {
    const tz = useMemo(getDefaultTimezone, []);

    const todayStr = useMemo(
        () => format(toZonedTime(new Date(), tz), 'yyyy-MM-dd'),
        [tz]
    );

    const today = useMemo(() => parseISO(todayStr), [todayStr]);

    // --- range state ---
    const [rangeStart, setRangeStart] = useState(() => addDays(today, -7));
    const [rangeEnd, setRangeEnd] = useState(() => addMonths(today, 2));

    // --- entries & loading state ---
    const [entries, setEntries] = useState<DayEntry[]>(() =>
        generateDayEntries(addDays(today, -7), addMonths(today, 2))
    );
    const [focusedDateLabel, setFocusedDateLabel] = useState<string | null>(null);
    const [loadingTop, setLoadingTop] = useState(false);
    const [loadingBottom, setLoadingBottom] = useState(false);
    const [hasMorePast, setHasMorePast] = useState(true);

    const supabase = useMemo(createClient, []);
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSaveTimeRef = useRef<number>(0);
    const entriesRef = useRef<DayEntry[]>(entries);
    entriesRef.current = entries;

    // prepend 時のスクロール位置補正に使う
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const scrollHeightBeforePrependRef = useRef<number>(0);
    const pendingScrollFixRef = useRef(false);

    const topSentinelRef = useRef<HTMLDivElement>(null);
    const bottomSentinelRef = useRef<HTMLDivElement>(null);
    const todaySectionRef = useRef<HTMLElement>(null);

    // --- 初回: 今日へスクロール + 初期 DB fetch ---
    useEffect(() => {
        todaySectionRef.current?.scrollIntoView({ block: 'start' });
    }, []);

    useEffect(() => {
        const startUtc = localTimeToUtc(format(rangeStart, 'yyyy-MM-dd'), '0000', tz);
        const endUtc = localTimeToUtc(
            format(addDays(rangeEnd, 1), 'yyyy-MM-dd'),
            '0000',
            tz
        );
        getSchedules(supabase, startUtc, endUtc).then(({ data, error }) => {
            if (error || !data) return;
            const draft = readDraftFromStorage();
            if (draft) clearDraftFromStorage();
            setEntries((prev) => mergeSchedulesIntoEntries(prev, data, tz, draft));
        });
        // 初回のみ実行（rangeStart/rangeEnd は増分 fetch で変更される）
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // --- beforeunload: 下書き保存 ---
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

    // --- prepend 後のスクロール位置補正 ---
    useLayoutEffect(() => {
        if (!pendingScrollFixRef.current) return;
        pendingScrollFixRef.current = false;
        const container = scrollContainerRef.current;
        if (!container) return;
        const diff = container.scrollHeight - scrollHeightBeforePrependRef.current;
        if (diff > 0) container.scrollTop += diff;
    });

    // --- debounce timer utils ---
    const clearDebounceTimer = useCallback(() => {
        if (!debounceTimerRef.current) return;
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
    }, []);

    // --- saveDay: dateLabel ベース ---
    const saveDay = useCallback(
        (dateLabel: string) => {
            const entry = entriesRef.current.find((e) => e.dateLabel === dateLabel);
            if (!entry) return;
            const dateStr = dateLabelToDateStr(entry.dateLabel);
            if (!dateStr) return;
            const day_start_utc = localTimeToUtc(dateStr, '0000', tz);
            const nextDateStr = format(addDays(parseISO(dateStr), 1), 'yyyy-MM-dd');
            const day_end_utc = localTimeToUtc(nextDateStr, '0000', tz);
            const items = dayContentToScheduleItems(dateStr, entry.content, tz);
            void replaceSchedulesForDay(supabase, day_start_utc, day_end_utc, items).catch(
                () => {
                    writeDraftToStorage(entriesRef.current);
                }
            );
        },
        [supabase, tz]
    );

    // --- updateDayContent ---
    const updateDayContent = (dateLabel: string, value: string) => {
        setEntries((prev) => {
            const next = [...prev];
            const idx = next.findIndex((e) => e.dateLabel === dateLabel);
            if (idx === -1) return prev;
            next[idx] = { ...next[idx], content: value };
            return next;
        });
        if (focusedDateLabel !== dateLabel) return;
        clearDebounceTimer();
        const now = Date.now();
        if (now - lastSaveTimeRef.current >= 10000) {
            lastSaveTimeRef.current = now;
            // ref も即時同期
            entriesRef.current = entriesRef.current.map((e) =>
                e.dateLabel === dateLabel ? { ...e, content: value } : e
            );
            saveDay(dateLabel);
        } else {
            debounceTimerRef.current = setTimeout(() => {
                debounceTimerRef.current = null;
                lastSaveTimeRef.current = Date.now();
                saveDay(dateLabel);
            }, 1000);
        }
    };

    // --- 未来方向: loadMoreFuture ---
    const loadMoreFuture = useCallback(async () => {
        if (loadingBottom) return;
        setLoadingBottom(true);
        const newEnd = addMonths(rangeEnd, 1);
        const newEntries = generateDayEntries(addDays(rangeEnd, 1), newEnd);
        const startUtc = localTimeToUtc(
            format(addDays(rangeEnd, 1), 'yyyy-MM-dd'),
            '0000',
            tz
        );
        const endUtc = localTimeToUtc(format(addDays(newEnd, 1), 'yyyy-MM-dd'), '0000', tz);
        const { data } = await getSchedules(supabase, startUtc, endUtc);
        const merged = mergeSchedulesIntoEntries(newEntries, data ?? [], tz, null);
        setEntries((prev) => [...prev, ...merged]);
        setRangeEnd(newEnd);
        setLoadingBottom(false);
    }, [loadingBottom, rangeEnd, supabase, tz]);

    // --- 過去方向: loadMorePast ---
    const loadMorePast = useCallback(async () => {
        if (loadingTop || !hasMorePast) return;
        setLoadingTop(true);
        const newStart = subMonths(rangeStart, 1);
        const newEntries = generateDayEntries(newStart, addDays(rangeStart, -1));
        const startUtc = localTimeToUtc(format(newStart, 'yyyy-MM-dd'), '0000', tz);
        const endUtc = localTimeToUtc(format(rangeStart, 'yyyy-MM-dd'), '0000', tz);
        const { data } = await getSchedules(supabase, startUtc, endUtc);
        if (!data || data.length === 0) {
            setHasMorePast(false);
            setLoadingTop(false);
            return;
        }
        const merged = mergeSchedulesIntoEntries(newEntries, data, tz, null);
        // scroll 位置補正のため prepend 前の scrollHeight を記録
        if (scrollContainerRef.current) {
            scrollHeightBeforePrependRef.current = scrollContainerRef.current.scrollHeight;
            pendingScrollFixRef.current = true;
        }
        setEntries((prev) => [...merged, ...prev]);
        setRangeStart(newStart);
        setLoadingTop(false);
    }, [loadingTop, hasMorePast, rangeStart, supabase, tz]);

    // --- IntersectionObserver ---
    useEffect(() => {
        const container = scrollContainerRef.current;
        const topSentinel = topSentinelRef.current;
        const bottomSentinel = bottomSentinelRef.current;
        if (!container || !topSentinel || !bottomSentinel) return;

        const obs = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) continue;
                    if (entry.target === bottomSentinel) {
                        void loadMoreFuture();
                    } else if (entry.target === topSentinel && hasMorePast) {
                        void loadMorePast();
                    }
                }
            },
            {
                root: container,
                rootMargin: '400px',
                threshold: 0,
            }
        );

        obs.observe(topSentinel);
        obs.observe(bottomSentinel);
        return () => obs.disconnect();
    }, [loadMoreFuture, loadMorePast, hasMorePast]);

    return (
        <div className="flex flex-col h-screen bg-neutral-100 dark:bg-neutral-950">
            {/* Header */}
            <header className="flex items-center px-6 py-3 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 shrink-0">
                <h1 className="text-base font-medium tracking-widest uppercase text-neutral-900 dark:text-neutral-100">
                    Schedules
                </h1>
            </header>

            {/* Scroll container */}
            <div
                ref={scrollContainerRef}
                className="flex-1 overflow-y-auto px-6 py-4 space-y-4"
                style={{ overflowAnchor: 'none' }}
            >
                {/* 上端 sentinel */}
                <div ref={topSentinelRef} />

                {/* 過去方向ローディング */}
                {loadingTop && (
                    <div className="flex justify-center py-2">
                        <span className="text-sm text-neutral-500">Loading...</span>
                    </div>
                )}

                {/* Day sections */}
                {entries.map((entry) => {
                    const entryDateStr = dateLabelToDateStr(entry.dateLabel);
                    const isToday = entryDateStr === todayStr;
                    return (
                        <section
                            key={entry.dateLabel}
                            ref={isToday ? todaySectionRef : null}
                            className={`rounded bg-neutral-50 dark:bg-neutral-900 overflow-hidden ${
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
                                    onChange={(e) =>
                                        updateDayContent(entry.dateLabel, e.target.value)
                                    }
                                    onFocus={() => setFocusedDateLabel(entry.dateLabel)}
                                    onBlur={() => {
                                        setFocusedDateLabel(null);
                                        clearDebounceTimer();
                                        lastSaveTimeRef.current = Date.now();
                                        saveDay(entry.dateLabel);
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

                {/* 未来方向ローディング */}
                {loadingBottom && (
                    <div className="flex justify-center py-2">
                        <span className="text-sm text-neutral-500">Loading...</span>
                    </div>
                )}

                {/* 下端 sentinel */}
                <div ref={bottomSentinelRef} />
            </div>
        </div>
    );
}
