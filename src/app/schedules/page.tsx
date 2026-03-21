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
import {
    clearDraftFromStorage,
    readDraftFromStorage,
    writeDraftToStorage,
} from '@/src/lib/schedules/draft-storage';
import { Inbox } from 'lucide-react';

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

    // Supabaseクライアントは1回作って使い回す。
    const supabase = useMemo(createClient, []);
    // schedules保存のデバウンス制御用タイマー。
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // 「10秒ルール」の前回保存時刻。
    const lastSaveTimeRef = useRef<number>(0);
    // 非同期イベント（visibilitychange/pagehide）でも現在フォーカス中の日付を参照する。
    const focusedDateLabelRef = useRef<string | null>(null);
    focusedDateLabelRef.current = focusedDateLabel;
    // beforeunload時に最新entriesへアクセスするためのref。
    const entriesRef = useRef<DayEntry[]>(entries);
    entriesRef.current = entries;

    // prepend 時のスクロール位置補正に使う
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const scrollHeightBeforePrependRef = useRef<number>(0);
    const pendingScrollFixRef = useRef(false);

    const topSentinelRef = useRef<HTMLDivElement>(null);
    const bottomSentinelRef = useRef<HTMLDivElement>(null);
    const todaySectionRef = useRef<HTMLElement>(null);
    const { inboxOpen, setInboxOpen, inboxContent, updateInboxContent, saveInboxNow, hasPendingChanges } =
        useInbox(supabase);

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
        getSchedules(supabase, startUtc, endUtc).then(({ data, error }) => {
            if (error || !data) return;
            // 離脱時に残した下書きがあれば優先して反映する。
            const draft = readDraftFromStorage();
            if (draft) clearDraftFromStorage();
            setEntries((prev) => mergeSchedulesIntoEntries(prev, data, tz, draft));
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // entries 初期生成後に今日のセクションへスクロール
    useEffect(() => {
        if (!todayStr || entries.length === 0) return;
        todaySectionRef.current?.scrollIntoView({ block: 'start' });
        // todayStr が確定した直後の1回のみ実行
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [todayStr]);

    // --- beforeunload: 未保存の変更がある場合のみ下書き保存 ---
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            // schedule下書きとInbox未保存をまとめて判定し、離脱時に最小限だけ保存する。
            const hasUnsaved = debounceTimerRef.current != null || hasPendingChanges;
            if (!hasUnsaved) return;
            if (debounceTimerRef.current != null) writeDraftToStorage(entriesRef.current);
            if (hasPendingChanges) saveInboxNow();
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            if (debounceTimerRef.current != null) writeDraftToStorage(entriesRef.current);
            if (hasPendingChanges) saveInboxNow();
        };
    }, [hasPendingChanges, saveInboxNow]);

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
            void replaceSchedulesForDay(supabase, day_start_utc, day_end_utc, items).catch(
                () => {
                    // 通信失敗時は内容を失わないようローカル下書きへ退避する。
                    writeDraftToStorage(entriesRef.current);
                }
            );
        },
        [supabase, tz]
    );

    const flushPendingScheduleSave = useCallback(() => {
        if (debounceTimerRef.current == null) return;
        clearDebounceTimer();
        const dateLabel = focusedDateLabelRef.current;
        if (!dateLabel) {
            writeDraftToStorage(entriesRef.current);
            return;
        }
        lastSaveTimeRef.current = Date.now();
        saveDay(dateLabel);
    }, [clearDebounceTimer, saveDay]);

    // --- updateDayContent ---
    const updateDayContent = (dateLabel: string, value: string) => {
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
        const now = Date.now();
        // 10秒以上空いていれば即保存、短ければ1秒待ってまとめて保存。
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
            }, 500);
        }
    };

    // --- hidden/pagehide: debounce待ちを即時フラッシュ ---
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState !== 'hidden') return;
            flushPendingScheduleSave();
            if (hasPendingChanges) saveInboxNow();
        };
        const handlePageHide = () => {
            flushPendingScheduleSave();
            if (hasPendingChanges) saveInboxNow();
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('pagehide', handlePageHide);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('pagehide', handlePageHide);
        };
    }, [flushPendingScheduleSave, hasPendingChanges, saveInboxNow]);

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
        const merged = mergeSchedulesIntoEntries(newEntries, data ?? [], tz, null);
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
        const merged = mergeSchedulesIntoEntries(newEntries, data, tz, null);
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
            <header className="flex items-center px-2 sm:px-6 py-2 sm:py-2 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 shrink-0">
                <h1 className="text-base sm:text-lg font-medium leading-6 sm:leading-7 tracking-widest uppercase text-neutral-900 dark:text-neutral-100">
                    Schedules
                </h1>
                <div className="ml-auto hidden sm:inline-flex">
                <Button
                    onClick={handleInboxToggle}
                    color={inboxOpen ? 'secondary' : 'ghost'}
                    size="md"
                    aria-label={inboxOpen ? 'Inboxを閉じる' : 'Inboxを開く'}
                >
                    <Inbox className="w-5 h-5" />
                    <span>Inbox</span>
                </Button>
                </div>
            </header>

            <div className="flex-1 overflow-hidden relative">
            <Button
                onClick={handleInboxToggle}
                color={inboxOpen ? 'secondary' : 'ghost'}
                size="md"
                className="sm:hidden fixed right-4 bottom-4 p-0 rounded"
                aria-label={inboxOpen ? 'Inboxを閉じる' : 'Inboxを開く'}
            >
                <Inbox className="w-6 h-6" />
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
                            onContentChange={(value) => updateDayContent(entry.dateLabel, value)}
                            onFocus={() => setFocusedDateLabel(entry.dateLabel)}
                            onBlur={() => {
                                setFocusedDateLabel(null);
                                clearDebounceTimer();
                                lastSaveTimeRef.current = Date.now();
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
                    onClose={() => {
                        saveInboxNow();
                        setInboxOpen(false);
                    }}
                />
            )}
            </div>
        </div>
    );
}
