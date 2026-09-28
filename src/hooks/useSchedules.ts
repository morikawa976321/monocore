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
    applyDefaultSchedules,
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
    decodeScheduleSaveOutcome,
    isScheduleRevisionConflict,
    ScheduleSaveQueue,
} from '@/src/lib/schedules/sync';

/**
 * 同じ日の自動保存が連続でこの回数失敗したら、その日の自動保存を打ち切る。
 * 失敗し続ける保存を無人でリトライすると、1クライアントがDBのエラーログだけで
 * インスタンスのDisk IOを飽和させる(2026-08-25の実障害)。人が編集し直せば解除される。
 */
const MAX_CONSECUTIVE_SAVE_FAILURES = 3;

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
    /** 日ごとの連続保存失敗回数。保存成功・編集・再読み込みでリセットする。 */
    const saveFailureCountRef = useRef(new Map<string, number>());
    /** 自動保存を打ち切った日。ユーザーの編集か再読み込みでのみ解除する。 */
    const autoSaveSuspendedRef = useRef(new Set<string>());

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

    /**
     * 読み込む日へ既定予定を書き込む。取得より前に待つこと（書き込み後の revision を読むため）。
     * 失敗しても予定の表示は止めない。既定予定が入らないだけで、次の読み込みで入る。
     */
    const applyDefaults = useCallback(
        async (startDay: string, endDay: string) => {
            const { error } = await applyDefaultSchedules(supabase, startDay, endDay, tz);
            if (error) console.error('既定予定の書き込みに失敗しました', error);
        },
        [supabase, tz]
    );

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
        void applyDefaults(format(start, 'yyyy-MM-dd'), format(end, 'yyyy-MM-dd'))
            .then(() => Promise.all([
                getSchedules(supabase, startUtc, endUtc),
                getScheduleDayRevisions(
                    supabase,
                    format(start, 'yyyy-MM-dd'),
                    format(end, 'yyyy-MM-dd')
                ),
            ]))
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
        await applyDefaults(format(rangeStart, 'yyyy-MM-dd'), format(rangeEnd, 'yyyy-MM-dd'));
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
            // サーバの最新revisionを取り込めたので、打ち切っていた日の自動保存を再開してよい。
            autoSaveSuspendedRef.current.clear();
            saveFailureCountRef.current.clear();
            setSyncError(null);
        } else {
            setSyncError('スケジュールの同期に失敗しました。');
        }
        setTodayStr(format(toZonedTime(new Date(), tz), 'yyyy-MM-dd'));
        setLoadingTop(false);
        setLoadingBottom(false);
    }, [rangeStart, rangeEnd, tz, supabase, loadNotes, applyDefaults]);

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
            if (autoSaveSuspendedRef.current.has(dateLabel)) return Promise.resolve();

            return saveQueueRef.current.enqueue(dateStr, async () => {
                if (!dirtyDateLabelsRef.current.has(dateLabel)) return;
                if (autoSaveSuspendedRef.current.has(dateLabel)) return;
                const entry = entriesRef.current.find((candidate) => candidate.dateLabel === dateLabel);
                if (!entry) return;

                const savedContent = entry.content;
                const day_start_utc = localTimeToUtc(dateStr, '0000', tz);
                const nextDateStr = format(addDays(parseISO(dateStr), 1), 'yyyy-MM-dd');
                const day_end_utc = localTimeToUtc(nextDateStr, '0000', tz);
                const items = dayContentToScheduleItems(dateStr, savedContent, tz);
                const { data: rpcResult, error } = await replaceSchedulesForDay(
                    supabase,
                    dateStr,
                    day_start_utc,
                    day_end_utc,
                    entry.revision,
                    items
                );
                const outcome = error
                    ? ({ kind: 'failed' } as const)
                    : decodeScheduleSaveOutcome(rpcResult);

                // 競合の合図は2つある。migration 20260902001000 以降のRPCは負の戻り値で返し、
                // それ以前は SQLSTATE 40001 の例外を投げる。ロールアウトの前後で両方が来うる。
                // 先にRPCだけを変えると、この分岐を持たないクライアントは競合を「成功」と
                // 誤読して編集内容を無言で捨てるので、こちらを先に配ること。
                if (outcome.kind === 'conflict' || isScheduleRevisionConflict(error)) {
                    // 楽観ロックの競合は待っても解消しない。dirtyを残したまま再試行すると
                    // 同じ expected_revision のまま永久に失敗し続けるので、この日は打ち切る。
                    let serverRevision: number | null = null;
                    if (outcome.kind === 'conflict') {
                        serverRevision = outcome.currentRevision;
                    } else {
                        // 旧RPC（例外）経路。現在revisionは戻り値に乗らないので取りに行く。
                        const { data: revisions } = await getScheduleDayRevisions(
                            supabase,
                            dateStr,
                            dateStr
                        );
                        serverRevision =
                            revisions?.find((row) => row.day_key === dateStr)?.revision ?? null;
                    }
                    const resolvedRevision = serverRevision;
                    if (resolvedRevision != null) {
                        const synced = entriesRef.current.map((current) =>
                            current.dateLabel === dateLabel
                                ? { ...current, revision: resolvedRevision }
                                : current
                        );
                        entriesRef.current = synced;
                        setEntries(synced);
                    }
                    saveFailureCountRef.current.set(
                        dateLabel,
                        (saveFailureCountRef.current.get(dateLabel) ?? 0) + 1
                    );
                    dirtyDateLabelsRef.current.delete(dateLabel);
                    autoSaveSuspendedRef.current.add(dateLabel);
                    setSyncError(
                        `${dateStr} は別のデバイスで更新されています。再読み込みしてください。`
                    );
                    return;
                }

                if (outcome.kind === 'failed') {
                    const failures = (saveFailureCountRef.current.get(dateLabel) ?? 0) + 1;
                    saveFailureCountRef.current.set(dateLabel, failures);

                    if (failures >= MAX_CONSECUTIVE_SAVE_FAILURES) {
                        dirtyDateLabelsRef.current.delete(dateLabel);
                        autoSaveSuspendedRef.current.add(dateLabel);
                        setSyncError(
                            `${dateStr} の保存に${MAX_CONSECUTIVE_SAVE_FAILURES}回続けて失敗したため自動保存を止めました。再読み込みしてください。`
                        );
                        return;
                    }

                    setSyncError(`${dateStr} の保存に失敗しました。`);
                    return;
                }

                saveFailureCountRef.current.delete(dateLabel);

                const nextEntries = entriesRef.current.map((current) => {
                    if (current.dateLabel !== dateLabel) return current;
                    if (current.content === savedContent) {
                        dirtyDateLabelsRef.current.delete(dateLabel);
                    }
                    return { ...current, revision: outcome.revision };
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
            // 人が編集し直したときだけ、打ち切った自動保存を再開する。
            autoSaveSuspendedRef.current.delete(dateLabel);
            saveFailureCountRef.current.delete(dateLabel);
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
        await applyDefaults(format(addDays(rangeEnd, 1), 'yyyy-MM-dd'), format(newEnd, 'yyyy-MM-dd'));
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
    }, [loadingBottom, rangeEnd, supabase, tz, loadNotes, applyDefaults]);

    const loadMorePast = useCallback(async () => {
        if (loadingTop || !hasMorePast || !rangeStart) return;
        setLoadingTop(true);
        const newStart = subMonths(rangeStart, 1);
        const newEntries = generateDayEntries(newStart, addDays(rangeStart, -1));
        const startUtc = localTimeToUtc(format(newStart, 'yyyy-MM-dd'), '0000', tz);
        const endUtc = localTimeToUtc(format(rangeStart, 'yyyy-MM-dd'), '0000', tz);
        await applyDefaults(format(newStart, 'yyyy-MM-dd'), format(addDays(rangeStart, -1), 'yyyy-MM-dd'));
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
    }, [loadingTop, hasMorePast, rangeStart, supabase, tz, loadNotes, applyDefaults]);

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
