'use client';

import { useEffect, useMemo, useRef } from 'react';
import { createClient } from '@/src/lib/supabase/client';
import { InboxPanel } from '@/src/components/inbox/InboxPanel';
import { GoalBar } from '@/src/components/plan/GoalBar';
import { DaySection } from '@/src/components/schedules/DaySection';
import { Button } from '@/src/components/ui/Button';
import { useInbox } from '@/src/hooks/useInbox';
import { useDayNotes } from '@/src/hooks/useDayNotes';
import { useNow } from '@/src/hooks/useNow';
import { usePlanDayContents } from '@/src/hooks/usePlanDayContents';
import { planGoalToInput, usePlanGoals } from '@/src/hooks/usePlanGoals';
import { useSchedules } from '@/src/hooks/useSchedules';
import { getDefaultTimezone } from '@/src/lib/date';
import {
    analyzeDayContent,
    daysBetween,
    evaluateGoals,
    placedCountStart,
    type DayAnalysis,
} from '@/src/lib/schedules/free-time';
import { dateLabelToDateStr } from '@/src/lib/schedules/text-format';
import { Inbox } from 'lucide-react';
import { LoadingIndicator } from '@/src/components/ui/LoadingIndicator';
import { PageHeader } from '@/src/components/layout/PageHeader';

/** スケジュール一覧・編集ページ。双方向無限スクロール対応。 */
export default function SchedulesPage() {
    const supabase = useMemo(() => createClient(), []);
    const { inboxOpen, setInboxOpen, inboxContent, updateInboxContent, saveInboxNow, hasPendingChanges } =
        useInbox(supabase);
    const {
        notes,
        loadNotes,
        updateNote,
        flushPendingNoteSaves,
        hasPendingNoteChanges,
        noteError,
    } = useDayNotes(supabase);
    const {
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
    } = useSchedules(supabase, {
        loadNotes,
        flushPendingNoteSaves,
        hasPendingNoteChanges,
        hasPendingInboxChanges: hasPendingChanges,
        saveInboxNow,
    });

    const { goals } = usePlanGoals(supabase);
    const timezone = useMemo(() => getDefaultTimezone(), []);
    const now = useNow();
    const goalInputs = useMemo(() => goals.map((g) => planGoalToInput(g, timezone)), [goals, timezone]);
    // 置いた時間は目標を作った日から数える(/plan と同じ)。板が読んでいない過去の日は別に読む。
    const pastStart = now ? placedCountStart(goalInputs, now.today) : null;
    const { contents: pastContents } = usePlanDayContents(
        supabase,
        pastStart,
        now && pastStart ? daysBetween(pastStart, now.today) : 0
    );
    // 目標の帯の数字。打つたびに計算し直す。板が読み込んだ範囲(概ね今日から2ヶ月先)より先の日は
    // 予定の無い日(07:00〜23:30 が空き)として数える。
    const goalStatuses = useMemo(() => {
        if (!now || isInitialSyncing || goalInputs.length === 0) return [];
        const days = new Map<string, DayAnalysis>();
        for (const [date, content] of pastContents) days.set(date, analyzeDayContent(content));
        // 板が読んだ日は、打ちかけの内容を優先する。
        for (const e of entries) days.set(dateLabelToDateStr(e.dateLabel), analyzeDayContent(e.content));
        return evaluateGoals({
            goals: goalInputs,
            days,
            today: now.today,
            nowMinutes: now.nowMinutes,
        });
    }, [entries, pastContents, goalInputs, now, isInitialSyncing]);

    // /plan の日ごとの一覧から ?day=YYYY-MM-DD で来たら、初回の同期の後にその日へ移る(1回だけ)。
    const dayTargetHandledRef = useRef(false);
    useEffect(() => {
        if (dayTargetHandledRef.current || isInitialSyncing || entries.length === 0) return;
        dayTargetHandledRef.current = true;
        const day = new URLSearchParams(window.location.search).get('day');
        if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
        document.getElementById(`day-${day}`)?.scrollIntoView({ block: 'start' });
        window.history.replaceState(null, '', window.location.pathname);
    }, [isInitialSyncing, entries]);

    const handleInboxToggle = () => {
        if (inboxOpen) saveInboxNow();
        setInboxOpen((prev) => !prev);
    };

    return (
        <div className="flex flex-col h-screen bg-neutral-100 dark:bg-neutral-950">
            <PageHeader
                title="Schedules"
                onRefresh={() => void reloadSchedules()}
                isRefreshing={isResumeSyncing}
            >
                {isInitialSyncing && (
                    <div className="inline-flex items-center gap-2">
                        <LoadingIndicator />
                        <span className="text-sm text-neutral-700 dark:text-neutral-300">同期中…</span>
                    </div>
                )}
                {syncError && (
                    <span className="text-sm text-amber-600 dark:text-amber-400">{syncError}</span>
                )}
                {noteError && (
                    <span className="text-sm text-amber-600 dark:text-amber-400">{noteError}</span>
                )}
                <div className="hidden sm:inline-flex">
                    <Button
                        onClick={handleInboxToggle}
                        color="secondary"
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

            <GoalBar statuses={goalStatuses} />

            <div className="flex-1 overflow-hidden relative">
                <Button
                    onClick={handleInboxToggle}
                    color="secondary"
                    size="md"
                    disabled={isEditLocked}
                    className="sm:hidden fixed right-4 bottom-4 p-0 rounded"
                    aria-label={inboxOpen ? 'Inboxを閉じる' : 'Inboxを開く'}
                >
                    <Inbox className="w-4 h-4" />
                    <span>Inbox</span>
                </Button>
                <div
                    ref={scrollContainerRef}
                    className="h-full overflow-y-auto px-2 sm:px-6 py-1 sm:py-4 space-y-2 sm:space-y-4"
                    style={{ overflowAnchor: 'none' }}
                >
                    <div ref={topSentinelRef} />

                    {loadingTop && (
                        <div className="flex justify-center py-2">
                            <LoadingIndicator />
                        </div>
                    )}

                    {entries.map((entry) => (
                        <DaySection
                            key={entry.dateLabel}
                            entry={entry}
                            isToday={dateLabelToDateStr(entry.dateLabel) === todayStr}
                            todayRef={todaySectionRef}
                            isReadOnly={isEditLocked}
                            onContentChange={(value) => updateDayContent(entry.dateLabel, value)}
                            note={notes.get(dateLabelToDateStr(entry.dateLabel)) ?? ''}
                            onNoteChange={(value) => {
                                if (isEditLocked) return;
                                updateNote(dateLabelToDateStr(entry.dateLabel), value);
                            }}
                            onFocus={() => focusDay(entry.dateLabel)}
                            onBlur={() => blurDay(entry.dateLabel)}
                            nowMinutes={now?.nowMinutes}
                        />
                    ))}

                    {loadingBottom && (
                        <div className="flex justify-center py-2">
                            <LoadingIndicator />
                        </div>
                    )}

                    <div ref={bottomSentinelRef} />
                </div>

                {isInitialSyncing && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-100/80 dark:bg-neutral-950/80">
                        <div className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800 rounded p-4">
                            <LoadingIndicator />
                            <span className="text-sm text-neutral-700 dark:text-neutral-300">同期中…</span>
                        </div>
                    </div>
                )}

                {inboxOpen && (
                    <InboxPanel
                        content={inboxContent}
                        onContentChange={updateInboxContent}
                        isReadOnly={isInitialSyncing}
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
