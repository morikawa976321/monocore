'use client';

import { useMemo, useState } from 'react';
import { createClient } from '@/src/lib/supabase/client';
import { InboxPanel } from '@/src/components/inbox/InboxPanel';
import { TasksPanel } from '@/src/components/tasks/TasksPanel';
import { DaySection } from '@/src/components/schedules/DaySection';
import { Button } from '@/src/components/ui/Button';
import { useBlockedProjects } from '@/src/hooks/useBlockedProjects';
import { useInbox } from '@/src/hooks/useInbox';
import { useDayNotes } from '@/src/hooks/useDayNotes';
import { useNow } from '@/src/hooks/useNow';
import { useSchedules } from '@/src/hooks/useSchedules';
import { analyzeDays } from '@/src/lib/schedules/free-time';
import { dateLabelToDateStr } from '@/src/lib/schedules/text-format';
import { Inbox, ListTodo } from 'lucide-react';
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
        unappliedDays,
        appliedDaysError,
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

    const now = useNow();
    // 3色の帯。睡眠は日をまたぐので、読み込んだ日をまとめて解析する（打つたびに再計算する）。画面に出す日は
    // 既定予定を書き込んでから読んでいるので、起床・消灯の行が無ければ本人が消したものとして補わない。ただし
    // 既定予定を書き込んだ記録の無い日（既定予定の effective_from より前の過去の日など）は、
    // 未読込として既定の起床・消灯で補う（本人選択 2026-10-18、docs/free-time-model.md カード4）。
    const analyses = useMemo(
        () =>
            analyzeDays(
                entries.map((e) => {
                    const date = dateLabelToDateStr(e.dateLabel);
                    return { date, content: e.content, loaded: !unappliedDays.has(date) };
                }),
            ),
        [entries, unappliedDays],
    );

    // Tasks（枠ごとのタスク）は Inbox と同じ形のモーダルで、同時には開かない。中身はページを開いたときに読んで
    // 持っておき（モーダルを開いたらすぐ出る）、開くたびに裏で読み直す（閉じている間に AI がスキルで書き換えた分を拾う）。
    const [tasksOpen, setTasksOpen] = useState(false);
    const tasks = useBlockedProjects(supabase);

    const handleInboxToggle = () => {
        if (inboxOpen) saveInboxNow();
        setTasksOpen(false);
        setInboxOpen((prev) => !prev);
    };

    const handleTasksToggle = () => {
        if (inboxOpen) {
            saveInboxNow();
            setInboxOpen(false);
        }
        if (!tasksOpen) void tasks.reload();
        setTasksOpen((prev) => !prev);
    };

    return (
        <div className="flex flex-col h-screen bg-neutral-250 dark:bg-neutral-900">
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
                {appliedDaysError && (
                    <span className="text-sm text-amber-600 dark:text-amber-400">{appliedDaysError}</span>
                )}
                {noteError && (
                    <span className="text-sm text-amber-600 dark:text-amber-400">{noteError}</span>
                )}
                <div className="hidden sm:inline-flex">
                    <Button
                        onClick={handleTasksToggle}
                        color="secondary"
                        size="md"
                        aria-label={tasksOpen ? 'Tasksを閉じる' : 'Tasksを開く'}
                        className="h-9 w-24"
                    >
                        <ListTodo className="w-4 h-4" />
                        Tasks
                    </Button>
                </div>
                <div className="hidden sm:inline-flex">
                    <Button
                        onClick={handleInboxToggle}
                        color="secondary"
                        size="md"
                        disabled={isEditLocked}
                        aria-label={inboxOpen ? 'Inboxを閉じる' : 'Inboxを開く'}
                        className="h-9 w-24"
                    >
                        <Inbox className="w-4 h-4" />
                        Inbox
                    </Button>
                </div>
            </PageHeader>

            {/* 一覧の上の余白はスクロールの外に置く。中に置くとスクロールで消え、日カードが上のヘッダーに直接接して
                境目が分からなくなる(2026-10-07 本人指摘)。 */}
            <div className="h-1 sm:h-4 shrink-0" aria-hidden="true" />

            <div className="flex-1 overflow-hidden relative">
                {/* Inbox ボタン(bottom-4、高さ 48px)の真上に 8px 空けて置く。ラベルの文字幅が違うので、2つの幅は w-24 で揃える。 */}
                <Button
                    onClick={handleTasksToggle}
                    color="secondary"
                    size="md"
                    className="sm:hidden fixed right-4 bottom-18 p-0 rounded h-12 w-24"
                    aria-label={tasksOpen ? 'Tasksを閉じる' : 'Tasksを開く'}
                >
                    <ListTodo className="w-4 h-4" />
                    <span>Tasks</span>
                </Button>
                <Button
                    onClick={handleInboxToggle}
                    color="secondary"
                    size="md"
                    disabled={isEditLocked}
                    className="sm:hidden fixed right-4 bottom-4 p-0 rounded h-12 w-24"
                    aria-label={inboxOpen ? 'Inboxを閉じる' : 'Inboxを開く'}
                >
                    <Inbox className="w-4 h-4" />
                    <span>Inbox</span>
                </Button>
                <div
                    ref={scrollContainerRef}
                    className="h-full overflow-y-auto px-2 sm:px-6 pb-1 sm:pb-4 space-y-2 sm:space-y-4"
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
                            analysis={analyses.get(dateLabelToDateStr(entry.dateLabel))!}
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
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-250/80 dark:bg-neutral-900/80">
                        <div className="flex items-center gap-2 bg-neutral-200 border border-neutral-300 dark:bg-neutral-800 dark:border-neutral-700 rounded p-4">
                            <LoadingIndicator />
                            <span className="text-sm text-neutral-700 dark:text-neutral-300">同期中…</span>
                        </div>
                    </div>
                )}

                {tasksOpen && (
                    <TasksPanel
                        projects={tasks.projects}
                        isLoading={tasks.isLoading}
                        error={tasks.error}
                        onCreate={(name, content) => void tasks.createProject(name, content)}
                        onUpdate={(id, loadedUpdatedAt, patch) => void tasks.updateProject(id, loadedUpdatedAt, patch)}
                        onClose={() => setTasksOpen(false)}
                    />
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
