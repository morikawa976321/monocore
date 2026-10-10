'use client';

import { useCallback, useMemo } from 'react';
import { PageHeader } from '@/src/components/layout/PageHeader';
import { CapacityChart } from '@/src/components/plan/CapacityChart';
import { GoalEditor } from '@/src/components/plan/GoalEditor';
import { LoadingIndicator } from '@/src/components/ui/LoadingIndicator';
import { useNow } from '@/src/hooks/useNow';
import { usePlanDayContents } from '@/src/hooks/usePlanDayContents';
import { planGoalToInput, usePlanGoals } from '@/src/hooks/usePlanGoals';
import { getDefaultTimezone } from '@/src/lib/date';
import type { CapacityDay } from '@/src/lib/plan/capacity-chart';
import {
    EMPTY_DAY,
    addDays,
    analyzeDayContent,
    daysBetween,
    evaluateGoals,
    placedCountStart,
    freeMinutesBetween,
    type DayAnalysis,
} from '@/src/lib/schedules/free-time';
import { createClient } from '@/src/lib/supabase/client';

/** 今日から先に予定を読む日数。期日がこれより先なら、その先は予定の無い日（EMPTY_DAY）として数える。 */
const HORIZON_DAYS = 120;
/** 累積グラフの幅（日）。目標の期日が先なら期日の3日後まで伸ばすが、予定を読んだ範囲で打ち切る。 */
const CHART_MIN_DAYS = 21;
/** 期日の入力の上限（年の打ち間違いを入口で止める）。 */
const MAX_DUE_YEARS = 3;

/** 囲みの外枠と見出しの帯は、予定の板の日付セクション（DaySection）に揃える。 */
const CARD = 'rounded overflow-hidden border border-neutral-400 bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-900';
const CARD_HEADER =
    'px-2 sm:px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50 text-sm leading-6 font-normal text-neutral-700 dark:text-neutral-300';
const CARD_BODY = 'px-2 sm:px-4 py-2';

/** 長期の計画。目標（この日までにこれを終える）と、締切までに使える空きを比べる。 */
export default function PlanPage() {
    const supabase = useMemo(() => createClient(), []);
    const timezone = useMemo(() => getDefaultTimezone(), []);
    const now = useNow();
    const { goals, isLoading: goalsLoading, error: goalsError, reload: reloadGoals, addGoal, updateGoal, removeGoal } =
        usePlanGoals(supabase);
    const goalInputs = useMemo(() => goals.map((g) => planGoalToInput(g, timezone)), [goals, timezone]);
    // 置いた時間を数えるために、目標を作った日（最大 PLACED_LOOKBACK_DAYS 日前）から読む。
    // 目標が届く前に今日から読み始めると、範囲が変わって2回読むことになるので待つ。
    const startDay = now && !goalsLoading ? placedCountStart(goalInputs, now.today) : null;
    const {
        contents,
        isLoading: contentsLoading,
        error: contentsError,
        reload: reloadContents,
    } = usePlanDayContents(
        supabase,
        startDay,
        now && startDay ? daysBetween(startDay, now.today) + HORIZON_DAYS : 0
    );

    const analyses = useMemo(() => {
        const map = new Map<string, DayAnalysis>();
        for (const [date, content] of contents) map.set(date, analyzeDayContent(content));
        return map;
    }, [contents]);
    const analyze = useCallback((date: string) => analyses.get(date) ?? EMPTY_DAY, [analyses]);

    const statuses = useMemo(() => {
        if (!now) return [];
        return evaluateGoals({
            goals: goalInputs,
            days: analyses,
            today: now.today,
            nowMinutes: now.nowMinutes,
        });
    }, [goalInputs, analyses, now]);

    const chartDays = useMemo(() => {
        if (!now) return [];
        const lastDue = statuses.filter((s) => !s.past).reduce((m, s) => (s.goal.dueOn > m ? s.goal.dueOn : m), now.today);
        const minEnd = addDays(now.today, CHART_MIN_DAYS - 1);
        const maxEnd = addDays(now.today, HORIZON_DAYS - 1);
        const wanted = lastDue > minEnd ? addDays(lastDue, 3) : minEnd;
        const end = wanted > maxEnd ? maxEnd : wanted;
        const days: CapacityDay[] = [];
        for (let d = now.today; d <= end; d = addDays(d, 1)) {
            const a = analyze(d);
            days.push({
                date: d,
                usableMinutes: freeMinutesBetween(a, d === now.today ? now.nowMinutes : 0, 24 * 60),
                wake: a.wake,
                sleep: a.sleep,
            });
        }
        return days;
    }, [now, statuses, analyze]);

    const handleAdd = useCallback(() => {
        if (!now) return;
        void addGoal({ name: '', due_on: addDays(now.today, 14), due_time: null, need_minutes: 0 });
    }, [addGoal, now]);

    // 予定は読み直しても前の内容を持ったままなので、覆いを出すのは最初の読み込みだけにする（他のページと同じ）。
    const isInitialLoading = !now || goalsLoading || (contentsLoading && contents.size === 0);
    const isRefreshing = contentsLoading && !isInitialLoading;
    const error = goalsError ?? contentsError;

    return (
        <div className="flex flex-col h-screen bg-neutral-100 dark:bg-neutral-950">
            <PageHeader
                title="Plan"
                onRefresh={() => {
                    void reloadGoals();
                    void reloadContents();
                }}
                isRefreshing={isRefreshing}
            >
                {isInitialLoading && (
                    <div className="inline-flex items-center gap-2">
                        <LoadingIndicator />
                        <span className="text-sm text-neutral-700 dark:text-neutral-300">同期中…</span>
                    </div>
                )}
                {error && <span className="text-sm text-amber-600 dark:text-amber-400">{error}</span>}
            </PageHeader>

            <div className="flex-1 overflow-hidden relative">
                <div className="h-full overflow-y-auto px-2 sm:px-6 py-1 sm:py-4 space-y-2 sm:space-y-4">
                    {now && (
                        <section className={CARD}>
                            <h2 className={CARD_HEADER}>目標</h2>
                            <div className={CARD_BODY}>
                                <GoalEditor
                                    goals={goals}
                                    today={now.today}
                                    nowMinutes={now.nowMinutes}
                                    maxDueOn={addDays(now.today, 365 * MAX_DUE_YEARS)}
                                    statuses={statuses}
                                    onAdd={handleAdd}
                                    onUpdate={(id, patch) => void updateGoal(id, patch)}
                                    onRemove={(id) => void removeGoal(id)}
                                />
                            </div>
                        </section>
                    )}

                    {now && (
                        <section className={CARD}>
                            <h2 className={CARD_HEADER}>締切までの時間</h2>
                            <div className={CARD_BODY}>
                                <CapacityChart days={chartDays} statuses={statuses} />
                            </div>
                        </section>
                    )}
                </div>

                {isInitialLoading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-100/80 dark:bg-neutral-950/80">
                        <div className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800 rounded p-4">
                            <LoadingIndicator />
                            <span className="text-sm text-neutral-700 dark:text-neutral-300">同期中…</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
