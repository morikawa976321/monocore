'use client';

import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { addDays, addMonths, subMonths, parseISO, format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { createClient } from '@/src/lib/supabase/client';
import { getSchedules, replaceSchedulesForDay } from '@/src/lib/supabase/queries/schedules';
import { getDefaultTimezone, localTimeToUtc } from '@/src/lib/date';
import { InboxPanel } from '@/src/components/inbox/InboxPanel';
import { DaySection } from '@/src/components/schedules/DaySection';
import { Button } from '@/src/components/ui/Button';
import { useInbox } from '@/src/hooks/useInbox';
import {
    dateLabelToDateStr,
    dayContentToScheduleItems,
    generateDayEntries,
    mergeSchedulesIntoEntries,
    type DayEntry,
} from '@/src/lib/schedules/text-format';
import { Inbox } from 'lucide-react';
import { PageHeader } from '@/src/components/layout/PageHeader';

/** スケジュール一覧・編集ページ。双方向無限スクロール対応。 */
export default function SchedulesPage() {
    // 日付計算の基準となるタイムゾーン。
    const tz = useMemo(getDefaultTimezone, []);

    // new Date() はサーバーとクライアントで値が異なるためハイドレーションエラーを避けるよう
    // SSR では null、useEffect（クライアントのみ）で確定させる。
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

    // Supabaseクライアントは1回作って使い回す。
    const supabase = useMemo(createClient, []);
    // schedules保存のデバウンス制御用タイマー。
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // 非同期イベント（visibilitychange/pagehide）でも現在フォーカス中の日付を参照する。
    const focusedDateLabelRef = useRef<string | null>(null);
    focusedDateLabelRef.current = focusedDateLabel;
    // フォーカスが外れても debounce 中の保存対象日付を参照する。
    const pendingSaveDateLabelRef = useRef<string | null>(null);
    // beforeunload時に最新entriesへアクセスするためのref。
    const entriesRef = useRef<DayEntry[]>(entries);
    entriesRef.current = entries;
    const isResumeSyncingRef = useRef(false);
    isResumeSyncingRef.current = isResumeSyncing;

    // prepend 時のスクロール位置補正に使う
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const scrollHeightBeforePrependRef = useRef<number>(0);
    const pendingScrollFixRef = useRef(false);
    // 初回 DB マージで過去日の高さが伸びたあと、今日を再スクロールする
    const scrollTodayAfterInitialMergeRef = useRef(false);

    const topSentinelRef = useRef<HTMLDivElement>(null);
    const bottomSentinelRef = useRef<HTMLDivElement>(null);
    const todaySectionRef = useRef<HTMLElement>(null);
    const { inboxOpen, setInboxOpen, inboxContent, updateInboxContent, saveInboxNow, hasPendingChanges } =
        useInbox(supabase);
    const isEditLocked = isInitialSyncing || isResumeSyncing;

    // --- 初回（クライアントのみ）: 日付確定 → entries 生成 → DB fetch → 今日へスクロール ---
    useEffect(() => {
        // まず「今日」を確定し、表示範囲（過去1週〜未来2か月）を決める。
        const str = format(toZonedTime(new Date(), tz), 'yyyy-MM-dd');
        const today = parseISO(str);
        const start = addDays(today, -7);
        const end = addMonths(today, 2);
        setTodayStr(str);
        setRangeStart(start);
        setRangeEnd(end);
        const initial = generateDayEntries(start, end);
        setEntries(initial);

        // 次にDBから実データを取得し、空の骨組みに上書きして完成形にする。
        const startUtc = localTimeToUtc(format(start, 'yyyy-MM-dd'), '0000', tz);
        const endUtc = localTimeToUtc(format(addDays(end, 1), 'yyyy-MM-dd'), '0000', tz);
        void getSchedules(supabase, startUtc, endUtc)
            .then(({ data, error }) => {
                if (error || !data) return;
                setEntries((prev) => mergeSchedulesIntoEntries(prev, data, tz));
                scrollTodayAfterInitialMergeRef.current = true;
            })
            .finally(() => {
                setIsInitialSyncing(false);
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const reloadSchedules = useCallback(async () => {
        if (!rangeStart || !rangeEnd) return;
        setLoadingTop(true);
        setLoadingBottom(true);
        const startUtc = localTimeToUtc(format(rangeStart, 'yyyy-MM-dd'), '0000', tz);
        const endUtc = localTimeToUtc(format(addDays(rangeEnd, 1), 'yyyy-MM-dd'), '0000', tz);
        const { data, error } = await getSchedules(supabase, startUtc, endUtc);
        if (!error && data) {
            setEntries((prev) => mergeSchedulesIntoEntries(prev, data, tz));
        }
        setLoadingTop(false);
        setLoadingBottom(false);
    }, [rangeStart, rangeEnd, tz, supabase]);

    // entries 初期生成後に今日のセクションへスクロール
    useEffect(() => {
        if (!todayStr || entries.length === 0) return;
        todaySectionRef.current?.scrollIntoView({ block: 'start' });
        // todayStr が確定した直後の1回のみ実行
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [todayStr]);

    // --- prepend 後のスクロール位置補正 ---
    useLayoutEffect(() => {
        if (!pendingScrollFixRef.current) return;
        pendingScrollFixRef.current = false;
        const container = scrollContainerRef.current;
        if (!container) return;
        const diff = container.scrollHeight - scrollHeightBeforePrependRef.current;
        if (diff > 0) container.scrollTop += diff;
    });

    // --- 初回 fetch マージ後: 過去日のテキストで上段が伸びても今日が先頭に留まるよう再スクロール ---
    useLayoutEffect(() => {
        if (!scrollTodayAfterInitialMergeRef.current || !todayStr) return;
        scrollTodayAfterInitialMergeRef.current = false;
        todaySectionRef.current?.scrollIntoView({ block: 'start' });
    }, [entries, todayStr]);

    // --- debounce timer utils ---
    const clearDebounceTimer = useCallback(() => {
        if (!debounceTimerRef.current) return;
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
    }, []);

    // --- saveDay: dateLabel ベース ---
    const saveDay = useCallback(
        (dateLabel: string) => {
            // 日付ラベルから該当日の入力内容を取り出す。
            const entry = entriesRef.current.find((e) => e.dateLabel === dateLabel);
            if (!entry) return;
            const dateStr = dateLabelToDateStr(entry.dateLabel);
            if (!dateStr) return;
            // ローカル日付の1日区間をUTCに変換してDB保存の範囲を確定する。
            const day_start_utc = localTimeToUtc(dateStr, '0000', tz);
            const nextDateStr = format(addDays(parseISO(dateStr), 1), 'yyyy-MM-dd');
            const day_end_utc = localTimeToUtc(nextDateStr, '0000', tz);
            const items = dayContentToScheduleItems(dateStr, entry.content, tz);
            void replaceSchedulesForDay(supabase, day_start_utc, day_end_utc, items);
        },
        [supabase, tz]
    );

    const flushPendingScheduleSave = useCallback(() => {
        if (debounceTimerRef.current == null) return;
        clearDebounceTimer();
        const dateLabel = pendingSaveDateLabelRef.current ?? focusedDateLabelRef.current;
        pendingSaveDateLabelRef.current = null;
        if (!dateLabel) return;
        saveDay(dateLabel);
    }, [clearDebounceTimer, saveDay]);

    // --- beforeunload: 未保存スケジュールは flush（saveDay）、Inbox は同期保存 ---
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            const hadScheduleDebounce = debounceTimerRef.current != null;
            flushPendingScheduleSave();
            if (hasPendingChanges) saveInboxNow();
            if (!hadScheduleDebounce && !hasPendingChanges) return;
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            flushPendingScheduleSave();
            if (hasPendingChanges) saveInboxNow();
        };
    }, [flushPendingScheduleSave, hasPendingChanges, saveInboxNow]);

    // --- updateDayContent ---
    const updateDayContent = (dateLabel: string, value: string) => {
        if (isEditLocked) return;
        // まず画面上の該当日の本文を更新する。
        setEntries((prev) => {
            const next = [...prev];
            const idx = next.findIndex((e) => e.dateLabel === dateLabel);
            if (idx === -1) return prev;
            next[idx] = { ...next[idx], content: value };
            return next;
        });
        // フォーカス中のテキストエリアだけ自動保存対象にする。
        if (focusedDateLabel !== dateLabel) return;
        clearDebounceTimer();
        pendingSaveDateLabelRef.current = dateLabel;
        debounceTimerRef.current = setTimeout(() => {
            debounceTimerRef.current = null;
            pendingSaveDateLabelRef.current = null;
            saveDay(dateLabel);
        }, 500);
    };

    // --- hidden / pagehide / freeze / アンマウント: debounce 待ちを即時フラッシュ（SPA 遷移はアンマウントで拾う） ---
    // PCタブ切り替え・スマホ最小化復帰時（visible）に未保存変更がなければ自動最新化 ---
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                flushPendingScheduleSave();
                if (hasPendingChanges) saveInboxNow();
                setFocusedDateLabel(null);
                pendingSaveDateLabelRef.current = null;
            } else if (document.visibilityState === 'visible') {
                if (pendingSaveDateLabelRef.current != null || focusedDateLabelRef.current != null || hasPendingChanges) {
                    return;
                }
                if (isResumeSyncingRef.current) return;
                isResumeSyncingRef.current = true;
                setIsResumeSyncing(true);
                void reloadSchedules().finally(() => {
                    isResumeSyncingRef.current = false;
                    setIsResumeSyncing(false);
                });
            }
        };
        const handlePageHide = () => {
            flushPendingScheduleSave();
            if (hasPendingChanges) saveInboxNow();
        };
        const handleFreeze = () => {
            flushPendingScheduleSave();
            if (hasPendingChanges) saveInboxNow();
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('pagehide', handlePageHide);
        window.addEventListener('freeze', handleFreeze);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('pagehide', handlePageHide);
            window.removeEventListener('freeze', handleFreeze);
            flushPendingScheduleSave();
            if (hasPendingChanges) saveInboxNow();
        };
    }, [flushPendingScheduleSave, hasPendingChanges, saveInboxNow, reloadSchedules]);

    // --- 未来方向: loadMoreFuture ---
    const loadMoreFuture = useCallback(async () => {
        if (loadingBottom || !rangeEnd) return;
        setLoadingBottom(true);
        // 現在末尾のさらに1か月先までを生成して取得する。
        const newEnd = addMonths(rangeEnd, 1);
        const newEntries = generateDayEntries(addDays(rangeEnd, 1), newEnd);
        const startUtc = localTimeToUtc(
            format(addDays(rangeEnd, 1), 'yyyy-MM-dd'),
            '0000',
            tz
        );
        const endUtc = localTimeToUtc(format(addDays(newEnd, 1), 'yyyy-MM-dd'), '0000', tz);
        const { data } = await getSchedules(supabase, startUtc, endUtc);
        const merged = mergeSchedulesIntoEntries(newEntries, data ?? [], tz);
        // 未来側は末尾に追加する。
        setEntries((prev) => [...prev, ...merged]);
        setRangeEnd(newEnd);
        setLoadingBottom(false);
    }, [loadingBottom, rangeEnd, supabase, tz]);

    // --- 過去方向: loadMorePast ---
    const loadMorePast = useCallback(async () => {
        if (loadingTop || !hasMorePast || !rangeStart) return;
        setLoadingTop(true);
        // 現在先頭のさらに1か月前を取得する。
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
        const merged = mergeSchedulesIntoEntries(newEntries, data, tz);
        // scroll 位置補正のため prepend 前の scrollHeight を記録
        if (scrollContainerRef.current) {
            scrollHeightBeforePrependRef.current = scrollContainerRef.current.scrollHeight;
            pendingScrollFixRef.current = true;
        }
        // 過去側は先頭に追加する（prepend）。
        setEntries((prev) => [...merged, ...prev]);
        setRangeStart(newStart);
        setLoadingTop(false);
    }, [loadingTop, hasMorePast, rangeStart, supabase, tz]);

    // --- IntersectionObserver ---
    useEffect(() => {
        // 上下の監視点が見えたら追加読み込みを発火する。
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
                // 少し早めに検知して、スクロール体験中に先読みする。
                rootMargin: '400px',
                threshold: 0,
            }
        );

        obs.observe(topSentinel);
        obs.observe(bottomSentinel);
        return () => obs.disconnect();
    }, [loadMoreFuture, loadMorePast, hasMorePast]);

    const handleInboxToggle = () => {
        if (inboxOpen) saveInboxNow();
        setInboxOpen((prev) => !prev);
    };

    return (
        <div className="flex flex-col h-screen bg-neutral-100 dark:bg-neutral-950">
            {/* Header */}
            <PageHeader title="Schedules" onRefresh={() => void reloadSchedules()}>
                <div className="hidden sm:inline-flex">
                    <Button
                        onClick={handleInboxToggle}
                        color={inboxOpen ? 'secondary' : 'ghost'}
                        size="md"
                        disabled={isEditLocked}
                        aria-label={inboxOpen ? 'Inboxを閉じる' : 'Inboxを開く'}
                        className="h-9"
                    >
                        <Inbox className="w-4 h-4" />
                        Inbox
                    </Button>
                </div>
            </PageHeader>

            <div className="flex-1 overflow-hidden relative">
                <Button
                    onClick={handleInboxToggle}
                    color={inboxOpen ? 'secondary' : 'ghost'}
                    size="md"
                    disabled={isEditLocked}
                    className="sm:hidden fixed right-4 bottom-4 p-0 rounded"
                    aria-label={inboxOpen ? 'Inboxを閉じる' : 'Inboxを開く'}
                >
                    <Inbox className="w-4 h-4" />
                    <span>Inbox</span>
                </Button>
                {/* Scroll container */}
                <div
                    ref={scrollContainerRef}
                    className="h-full overflow-y-auto px-2 sm:px-6 py-1 sm:py-4 space-y-2 sm:space-y-4"
                    style={{ overflowAnchor: 'none' }}
                >
                    {/* 上端 sentinel */}
                    <div ref={topSentinelRef} />

                    {/* 過去方向ローディング */}
                    {loadingTop && (
                        <div className="flex justify-center py-2">
                            <span className="text-sm leading-6 text-neutral-500">Loading...</span>
                        </div>
                    )}

                    {/* Day sections */}
                    {entries.map((entry) => {
                        const entryDateStr = dateLabelToDateStr(entry.dateLabel);
                        const isToday = entryDateStr === todayStr;
                        return (
                            // 1日分の表示/編集は DaySection に委譲する。
                            <DaySection
                                key={entry.dateLabel}
                                entry={entry}
                                isToday={isToday}
                                todayRef={todaySectionRef}
                                isReadOnly={isEditLocked}
                                onContentChange={(value) => updateDayContent(entry.dateLabel, value)}
                                onFocus={() => {
                                    if (isEditLocked) return;
                                    setFocusedDateLabel(entry.dateLabel);
                                }}
                                onBlur={() => {
                                    setFocusedDateLabel(null);
                                    if (isEditLocked) return;
                                    clearDebounceTimer();
                                    pendingSaveDateLabelRef.current = null;
                                    saveDay(entry.dateLabel);
                                }}
                            />
                        );
                    })}

                    {/* 未来方向ローディング */}
                    {loadingBottom && (
                        <div className="flex justify-center py-2">
                            <span className="text-sm leading-6 text-neutral-500">Loading...</span>
                        </div>
                    )}

                    {/* 下端 sentinel */}
                    <div ref={bottomSentinelRef} />
                </div>

                {/* Inbox panel */}
                {inboxOpen && (
                    <InboxPanel
                        content={inboxContent}
                        onContentChange={updateInboxContent}
                        isReadOnly={isEditLocked}
                        onClose={() => {
                            saveInboxNow();
                            setInboxOpen(false);
                        }}
                    />
                )}
                {isEditLocked && (
                    <div className="absolute inset-0 z-20 bg-neutral-200 dark:bg-neutral-900 opacity-80 flex items-center justify-center">
                        <p className="text-sm text-neutral-900 dark:text-neutral-50 font-medium">
                            同期中...
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
