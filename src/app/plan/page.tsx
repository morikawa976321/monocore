'use client';

import { useCallback, useMemo } from 'react';
import { PageHeader } from '@/src/components/layout/PageHeader';
import { CapacityChart, type CapacityDay } from '@/src/components/plan/CapacityChart';
import { DayFreeList } from '@/src/components/plan/DayFreeList';
import { FreeTimeLegend } from '@/src/components/plan/FreeTimeStrip';
import { GoalEditor } from '@/src/components/plan/GoalEditor';
import { LoadingIndicator } from '@/src/components/ui/LoadingIndicator';
import { useNow } from '@/src/hooks/useNow';
import { usePlanDayContents } from '@/src/hooks/usePlanDayContents';
import { planGoalToInput, usePlanGoals } from '@/src/hooks/usePlanGoals';
import { getDefaultTimezone } from '@/src/lib/date';
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

/** 今日から先に予定を読む日数。期日がこれより先なら、その先は予定の無い日（07:00〜23:30 が空き）として数える。 */
const HORIZON_DAYS = 120;
/** 日ごとの空きの一覧に出す日数。 */
const LIST_DAYS = 21;
/** 累積グラフの幅（日）。目標の期日が先なら期日の3日後まで伸ばすが、予定を読んだ範囲で打ち切る。 */
const CHART_MIN_DAYS = 21;
/** 期日の入力の上限（年の打ち間違いを入口で止める）。 */
const MAX_DUE_YEARS = 3;

const CARD = 'rounded border border-neutral-400 bg-neutral-50 p-4 dark:border-neutral-600 dark:bg-neutral-900';

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

    const listDays = useMemo(() => {
        if (!now) return [];
        return Array.from({ length: LIST_DAYS }, (_, i) => {
            const date = addDays(now.today, i);
            return { date, analysis: analyze(date) };
        });
    }, [now, analyze]);

    const deadlines = useMemo(() => {
        const map = new Map<string, string[]>();
        for (const g of goals) map.set(g.due_on, [...(map.get(g.due_on) ?? []), g.name || '（名前なし）']);
        return map;
    }, [goals]);

    const handleAdd = useCallback(() => {
        if (!now) return;
        void addGoal({ name: '', due_on: addDays(now.today, 14), due_time: null, need_minutes: 0 });
    }, [addGoal, now]);

    const isLoading = !now || goalsLoading || contentsLoading;
    const error = goalsError ?? contentsError;

    return (
        <div className="flex flex-col h-screen bg-neutral-100 dark:bg-neutral-950">
            <PageHeader
                title="Plan"
                onRefresh={() => {
                    void reloadGoals();
                    void reloadContents();
                }}
            >
                {isLoading && <LoadingIndicator />}
                {error && <span className="text-sm text-amber-600 dark:text-amber-400">{error}</span>}
            </PageHeader>

            <div className="flex-1 overflow-y-auto px-2 py-2 sm:px-6 sm:py-4">
                <div className="mx-auto max-w-5xl space-y-4">
                    <section className={`${CARD} space-y-2`}>
                        <div className="flex items-baseline justify-between gap-2">
                            <h2 className="text-base font-medium">目標</h2>
                            <span className="text-sm text-neutral-700 dark:text-neutral-300">この日までにこれを終える</span>
                        </div>
                        <GoalEditor
                            goals={goals}
                            maxDueOn={now ? addDays(now.today, 365 * MAX_DUE_YEARS) : undefined}
                            statuses={statuses}
                            onAdd={handleAdd}
                            onUpdate={(id, patch) => void updateGoal(id, patch)}
                            onRemove={(id) => void removeGoal(id)}
                        />
                    </section>

                    <section className={`${CARD} space-y-2`}>
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <h2 className="text-base font-medium">締切までの時間</h2>
                            <span className="text-sm text-neutral-700 dark:text-neutral-300">
                                自由時間 = 起床〜消灯から、予定と起床後の身支度（最大2時間）を除いた時間
                            </span>
                        </div>
                        {now && <CapacityChart days={chartDays} statuses={statuses} />}
                    </section>

                    <section className={`${CARD} space-y-2`}>
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <h2 className="text-base font-medium">日ごとの空き</h2>
                            <span className="text-sm text-neutral-700 dark:text-neutral-300">押すとスケジュールのその日へ</span>
                        </div>
                        <FreeTimeLegend />
                        {now && (
                            <DayFreeList days={listDays} today={now.today} nowMinutes={now.nowMinutes} deadlines={deadlines} />
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}
