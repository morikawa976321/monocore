'use client';

import {
    useState,
    useRef,
    useEffect,
    useLayoutEffect,
    useMemo,
    useCallback,
    type RefObject,
} from 'react';
import { addDays, addMonths, subMonths, parseISO, format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/src/types/database.types';
import {
    getScheduleDayRevisions,
    getSchedules,
    replaceSchedulesForDay,
} from '@/src/lib/supabase/queries/schedules';
import { getDefaultTimezone, localTimeToUtc } from '@/src/lib/date';
import {
    dateLabelToDateStr,
    dayContentToScheduleItems,
    generateDayEntries,
    mergeSchedulesIntoEntries,
    type DayEntry,
} from '@/src/lib/schedules/text-format';
import {
    applyScheduleRevisions,
    isScheduleRevisionConflict,
    ScheduleSaveQueue,
} from '@/src/lib/schedules/sync';

type UseSchedulesCompanions = {
    loadNotes: (startDay: string, endDay: string) => Promise<number>;
    flushPendingNoteSaves: () => void;
    hasPendingNoteChanges: boolean;
    hasPendingInboxChanges: boolean;
    saveInboxNow: () => void;
};

type UseSchedulesReturn = {
    todayStr: string | null;
    entries: DayEntry[];
    loadingTop: boolean;
    loadingBottom: boolean;
    isInitialSyncing: boolean;
    isResumeSyncing: boolean;
    isEditLocked: boolean;
    syncError: string | null;
    scrollContainerRef: RefObject<HTMLDivElement | null>;
    topSentinelRef: RefObject<HTMLDivElement | null>;
    bottomSentinelRef: RefObject<HTMLDivElement | null>;
    todaySectionRef: RefObject<HTMLElement | null>;
    reloadSchedules: () => Promise<void>;
    updateDayContent: (dateLabel: string, value: string) => void;
    focusDay: (dateLabel: string) => void;
    blurDay: (dateLabel: string) => void;
};

/** スケジュール一覧の取得・保存・双方向無限スクロール・ライフサイクル同期。 */
export function useSchedules(
    supabase: SupabaseClient<Database>,
    companions: UseSchedulesCompanions
): UseSchedulesReturn {
    const {
        loadNotes,
        flushPendingNoteSaves,
        hasPendingNoteChanges,
        hasPendingInboxChanges,
        saveInboxNow,
    } = companions;

    const tz = useMemo(() => getDefaultTimezone(), []);

    const [todayStr, setTodayStr] = useState<string | null>(null);
    const [rangeStart, setRangeStart] = useState<Date | null>(null);
    const [rangeEnd, setRangeEnd] = useState<Date | null>(null);
    const [entries, setEntries] = useState<DayEntry[]>([]);
    const [focusedDateLabel, setFocusedDateLabel] = useState<string | null>(null);
    const [loadingTop, setLoadingTop] = useState(false);
    const [loadingBottom, setLoadingBottom] = useState(false);
    const [hasMorePast, setHasMorePast] = useState(true);
    const [isInitialSyncing, setIsInitialSyncing] = useState(true);
    const [isResumeSyncing, setIsResumeSyncing] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);

    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const focusedDateLabelRef = useRef<string | null>(null);
    const pendingSaveDateLabelRef = useRef<string | null>(null);
    const entriesRef = useRef<DayEntry[]>(entries);
    const isResumeSyncingRef = useRef(false);
    const dirtyDateLabelsRef = useRef(new Set<string>());
    const saveQueueRef = useRef(new ScheduleSaveQueue());

    useLayoutEffect(() => {
        focusedDateLabelRef.current = focusedDateLabel;
        entriesRef.current = entries;
        isResumeSyncingRef.current = isResumeSyncing;
    });

    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const scrollHeightBeforePrependRef = useRef<number>(0);
    const pendingScrollFixRef = useRef(false);
    const scrollTodayAfterInitialMergeRef = useRef(false);

    const topSentinelRef = useRef<HTMLDivElement>(null);
    const bottomSentinelRef = useRef<HTMLDivElement>(null);
    const todaySectionRef = useRef<HTMLElement | null>(null);

    // イベントハンドラ内から最新値を読むためのref。依存配列に入れると、未保存状態が
    // 切り替わるたびにeffectが張り直され、その掃除でデバウンス待ちが即時保存されてしまう。
    const hasPendingNoteChangesRef = useRef(false);
    useLayoutEffect(() => {
        hasPendingNoteChangesRef.current = hasPendingNoteChanges;
    });
    const isEditLocked = isInitialSyncing || isResumeSyncing;

    // --- 初回（クライアントのみ）: 日付確定 → entries 生成 → DB fetch → 今日へスクロール ---
    useEffect(() => {
        const str = format(toZonedTime(new Date(), tz), 'yyyy-MM-dd');
        const today = parseISO(str);
        const start = addDays(today, -7);
        const end = addMonths(today, 2);
        setTodayStr(str);
        setRangeStart(start);
        setRangeEnd(end);
        const initial = generateDayEntries(start, end);
        setEntries(initial);

        const startUtc = localTimeToUtc(format(start, 'yyyy-MM-dd'), '0000', tz);
        const endUtc = localTimeToUtc(format(addDays(end, 1), 'yyyy-MM-dd'), '0000', tz);
        void loadNotes(format(start, 'yyyy-MM-dd'), format(end, 'yyyy-MM-dd'));
        void Promise.all([
            getSchedules(supabase, startUtc, endUtc),
            getScheduleDayRevisions(
                supabase,
                format(start, 'yyyy-MM-dd'),
                format(end, 'yyyy-MM-dd')
            ),
        ])
            .then(([schedulesResult, revisionsResult]) => {
                if (schedulesResult.error || revisionsResult.error) {
                    setSyncError('スケジュールの読み込みに失敗しました。');
                    return;
                }
                const merged = mergeSchedulesIntoEntries(initial, schedulesResult.data ?? [], tz);
                setEntries(applyScheduleRevisions(merged, revisionsResult.data ?? []));
                scrollTodayAfterInitialMergeRef.current = true;
            })
            .finally(() => {
                setTodayStr(format(toZonedTime(new Date(), tz), 'yyyy-MM-dd'));
                setIsInitialSyncing(false);
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const reloadSchedules = useCallback(async () => {
        if (!rangeStart || !rangeEnd) return;
        setLoadingTop(true);
        setLoadingBottom(true);
        void loadNotes(format(rangeStart, 'yyyy-MM-dd'), format(rangeEnd, 'yyyy-MM-dd'));
        const startUtc = localTimeToUtc(format(rangeStart, 'yyyy-MM-dd'), '0000', tz);
        const endUtc = localTimeToUtc(format(addDays(rangeEnd, 1), 'yyyy-MM-dd'), '0000', tz);
        const [schedulesResult, revisionsResult] = await Promise.all([
            getSchedules(supabase, startUtc, endUtc),
            getScheduleDayRevisions(
                supabase,
                format(rangeStart, 'yyyy-MM-dd'),
                format(rangeEnd, 'yyyy-MM-dd')
            ),
        ]);
        if (!schedulesResult.error && !revisionsResult.error) {
            setEntries((prev) => {
                const merged = applyScheduleRevisions(
                    mergeSchedulesIntoEntries(prev, schedulesResult.data ?? [], tz),
                    revisionsResult.data ?? []
                );
                return merged.map((entry, index) =>
                    dirtyDateLabelsRef.current.has(entry.dateLabel) ? prev[index] : entry
                );
            });
            setSyncError(null);
        } else {
            setSyncError('スケジュールの同期に失敗しました。');
        }
        setTodayStr(format(toZonedTime(new Date(), tz), 'yyyy-MM-dd'));
        setLoadingTop(false);
        setLoadingBottom(false);
    }, [rangeStart, rangeEnd, tz, supabase, loadNotes]);

    useEffect(() => {
        if (!todayStr || entries.length === 0) return;
        todaySectionRef.current?.scrollIntoView({ block: 'start' });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [todayStr]);

    useLayoutEffect(() => {
        if (!pendingScrollFixRef.current) return;
        pendingScrollFixRef.current = false;
        const container = scrollContainerRef.current;
        if (!container) return;
        const diff = container.scrollHeight - scrollHeightBeforePrependRef.current;
        if (diff > 0) container.scrollTop += diff;
    });

    useLayoutEffect(() => {
        if (!scrollTodayAfterInitialMergeRef.current || !todayStr) return;
        scrollTodayAfterInitialMergeRef.current = false;
        todaySectionRef.current?.scrollIntoView({ block: 'start' });
    }, [entries, todayStr]);

    const clearDebounceTimer = useCallback(() => {
        if (!debounceTimerRef.current) return;
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
    }, []);

    const saveDay = useCallback(
        (dateLabel: string) => {
            const dateStr = dateLabelToDateStr(dateLabel);
            if (!dateStr || !dirtyDateLabelsRef.current.has(dateLabel)) return Promise.resolve();

            return saveQueueRef.current.enqueue(dateStr, async () => {
                if (!dirtyDateLabelsRef.current.has(dateLabel)) return;
                const entry = entriesRef.current.find((candidate) => candidate.dateLabel === dateLabel);
                if (!entry) return;

                const savedContent = entry.content;
                const day_start_utc = localTimeToUtc(dateStr, '0000', tz);
                const nextDateStr = format(addDays(parseISO(dateStr), 1), 'yyyy-MM-dd');
                const day_end_utc = localTimeToUtc(nextDateStr, '0000', tz);
                const items = dayContentToScheduleItems(dateStr, savedContent, tz);
                const { data: nextRevision, error } = await replaceSchedulesForDay(
                    supabase,
                    dateStr,
                    day_start_utc,
                    day_end_utc,
                    entry.revision,
                    items
                );

                if (error || nextRevision == null) {
                    setSyncError(
                        isScheduleRevisionConflict(error)
                            ? `${dateStr} は別のデバイスで更新されています。再読み込みしてください。`
                            : `${dateStr} の保存に失敗しました。`
                    );
                    return;
                }

                const nextEntries = entriesRef.current.map((current) => {
                    if (current.dateLabel !== dateLabel) return current;
                    if (current.content === savedContent) {
                        dirtyDateLabelsRef.current.delete(dateLabel);
                    }
                    return { ...current, revision: nextRevision };
                });
                entriesRef.current = nextEntries;
                setEntries(nextEntries);
                setSyncError(null);
            });
        },
        [supabase, tz]
    );

    const flushPendingScheduleSave = useCallback(() => {
        if (debounceTimerRef.current == null) return;
        clearDebounceTimer();
        const dateLabel = pendingSaveDateLabelRef.current ?? focusedDateLabelRef.current;
        pendingSaveDateLabelRef.current = null;
        if (!dateLabel) return;
        void saveDay(dateLabel);
    }, [clearDebounceTimer, saveDay]);

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            const hadScheduleDebounce = debounceTimerRef.current != null;
            flushPendingScheduleSave();
            flushPendingNoteSaves();
            if (hasPendingInboxChanges) saveInboxNow();
            if (!hadScheduleDebounce && !hasPendingInboxChanges && !hasPendingNoteChangesRef.current) {
                return;
            }
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            flushPendingScheduleSave();
            if (hasPendingInboxChanges) saveInboxNow();
        };
        // メモのアンマウント時保存は useDayNotes 側が行うため、ここでは flush しない。
    }, [flushPendingScheduleSave, flushPendingNoteSaves, hasPendingInboxChanges, saveInboxNow]);

    const updateDayContent = useCallback(
        (dateLabel: string, value: string) => {
            if (isEditLocked) return;
            dirtyDateLabelsRef.current.add(dateLabel);
            setSyncError(null);
            setEntries((prev) => {
                const next = [...prev];
                const idx = next.findIndex((e) => e.dateLabel === dateLabel);
                if (idx === -1) return prev;
                next[idx] = { ...next[idx], content: value };
                entriesRef.current = next;
                return next;
            });
            if (focusedDateLabel !== dateLabel) return;
            clearDebounceTimer();
            pendingSaveDateLabelRef.current = dateLabel;
            debounceTimerRef.current = setTimeout(() => {
                debounceTimerRef.current = null;
                pendingSaveDateLabelRef.current = null;
                void saveDay(dateLabel);
            }, 500);
        },
        [isEditLocked, focusedDateLabel, clearDebounceTimer, saveDay]
    );

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                flushPendingScheduleSave();
                flushPendingNoteSaves();
                if (hasPendingInboxChanges) saveInboxNow();
                setFocusedDateLabel(null);
                pendingSaveDateLabelRef.current = null;
            } else if (document.visibilityState === 'visible') {
                if (
                    pendingSaveDateLabelRef.current != null
                    || focusedDateLabelRef.current != null
                    || hasPendingInboxChanges
                    || hasPendingNoteChangesRef.current
                ) {
                    return;
                }
                if (isResumeSyncingRef.current) return;
                isResumeSyncingRef.current = true;
                setIsResumeSyncing(true);
                void saveQueueRef.current.waitForIdle().then(reloadSchedules).finally(() => {
                    isResumeSyncingRef.current = false;
                    setIsResumeSyncing(false);
                });
            }
        };
        const handlePageHide = () => {
            flushPendingScheduleSave();
            flushPendingNoteSaves();
            if (hasPendingInboxChanges) saveInboxNow();
        };
        const handleFreeze = () => {
            flushPendingScheduleSave();
            flushPendingNoteSaves();
            if (hasPendingInboxChanges) saveInboxNow();
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('pagehide', handlePageHide);
        window.addEventListener('freeze', handleFreeze);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('pagehide', handlePageHide);
            window.removeEventListener('freeze', handleFreeze);
            flushPendingScheduleSave();
            if (hasPendingInboxChanges) saveInboxNow();
        };
    }, [
        flushPendingScheduleSave,
        flushPendingNoteSaves,
        hasPendingInboxChanges,
        saveInboxNow,
        reloadSchedules,
    ]);

    const loadMoreFuture = useCallback(async () => {
        if (loadingBottom || !rangeEnd) return;
        setLoadingBottom(true);
        const newEnd = addMonths(rangeEnd, 1);
        const newEntries = generateDayEntries(addDays(rangeEnd, 1), newEnd);
        void loadNotes(
            format(addDays(rangeEnd, 1), 'yyyy-MM-dd'),
            format(newEnd, 'yyyy-MM-dd')
        );
        const startUtc = localTimeToUtc(
            format(addDays(rangeEnd, 1), 'yyyy-MM-dd'),
            '0000',
            tz
        );
        const endUtc = localTimeToUtc(format(addDays(newEnd, 1), 'yyyy-MM-dd'), '0000', tz);
        const [schedulesResult, revisionsResult] = await Promise.all([
            getSchedules(supabase, startUtc, endUtc),
            getScheduleDayRevisions(
                supabase,
                format(addDays(rangeEnd, 1), 'yyyy-MM-dd'),
                format(newEnd, 'yyyy-MM-dd')
            ),
        ]);
        const merged = applyScheduleRevisions(
            mergeSchedulesIntoEntries(newEntries, schedulesResult.data ?? [], tz),
            revisionsResult.data ?? []
        );
        setEntries((prev) => [...prev, ...merged]);
        setRangeEnd(newEnd);
        setLoadingBottom(false);
    }, [loadingBottom, rangeEnd, supabase, tz, loadNotes]);

    const loadMorePast = useCallback(async () => {
        if (loadingTop || !hasMorePast || !rangeStart) return;
        setLoadingTop(true);
        const newStart = subMonths(rangeStart, 1);
        const newEntries = generateDayEntries(newStart, addDays(rangeStart, -1));
        const startUtc = localTimeToUtc(format(newStart, 'yyyy-MM-dd'), '0000', tz);
        const endUtc = localTimeToUtc(format(rangeStart, 'yyyy-MM-dd'), '0000', tz);
        const [noteCount, [schedulesResult, revisionsResult]] = await Promise.all([
            loadNotes(
                format(newStart, 'yyyy-MM-dd'),
                format(addDays(rangeStart, -1), 'yyyy-MM-dd')
            ),
            Promise.all([
                getSchedules(supabase, startUtc, endUtc),
                getScheduleDayRevisions(
                    supabase,
                    format(newStart, 'yyyy-MM-dd'),
                    format(addDays(rangeStart, -1), 'yyyy-MM-dd')
                ),
            ]),
        ]);
        const scheduleRows = schedulesResult.data ?? [];
        if (scheduleRows.length === 0 && noteCount === 0) {
            setHasMorePast(false);
            setLoadingTop(false);
            return;
        }
        const merged = applyScheduleRevisions(
            mergeSchedulesIntoEntries(newEntries, scheduleRows, tz),
            revisionsResult.data ?? []
        );
        if (scrollContainerRef.current) {
            scrollHeightBeforePrependRef.current = scrollContainerRef.current.scrollHeight;
            pendingScrollFixRef.current = true;
        }
        setEntries((prev) => [...merged, ...prev]);
        setRangeStart(newStart);
        setLoadingTop(false);
    }, [loadingTop, hasMorePast, rangeStart, supabase, tz, loadNotes]);

    useEffect(() => {
        const container = scrollContainerRef.current;
        const topSentinel = topSentinelRef.current;
        const bottomSentinel = bottomSentinelRef.current;
        if (!container || !topSentinel || !bottomSentinel) return;

        const obs = new IntersectionObserver(
            (observed) => {
                for (const entry of observed) {
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

    const focusDay = useCallback(
        (dateLabel: string) => {
            if (isEditLocked) return;
            setFocusedDateLabel(dateLabel);
        },
        [isEditLocked]
    );

    const blurDay = useCallback(
        (dateLabel: string) => {
            setFocusedDateLabel(null);
            if (isEditLocked) return;
            clearDebounceTimer();
            pendingSaveDateLabelRef.current = null;
            void saveDay(dateLabel);
        },
        [isEditLocked, clearDebounceTimer, saveDay]
    );

    return {
        todayStr,
        entries,
        loadingTop,
        loadingBottom,
        isInitialSyncing,
        isResumeSyncing,
        isEditLocked,
        syncError,
        scrollContainerRef,
        topSentinelRef,
        bottomSentinelRef,
        todaySectionRef,
        reloadSchedules,
        updateDayContent,
        focusDay,
        blurDay,
    };
}
