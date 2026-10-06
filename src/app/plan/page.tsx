'use client';

import { useCallback, useMemo } from 'react';
import { PageHeader } from '@/src/components/layout/PageHeader';
import { CapacityChart, type CapacityDay } from '@/src/components/plan/CapacityChart';
import { DayFreeList } from '@/src/components/plan/DayFreeList';
import { FreeTimeLegend } from '@/src/components/plan/FreeTimeStrip';
import { GoalEditor } from '@/src/components/plan/GoalEditor';
import { Button } from '@/src/components/ui/Button';
import { LoadingIndicator } from '@/src/components/ui/LoadingIndicator';
import { useLifeHours } from '@/src/hooks/useLifeHours';
import { useNow } from '@/src/hooks/useNow';
import { usePlanDayContents } from '@/src/hooks/usePlanDayContents';
import { planGoalToInput, usePlanGoals } from '@/src/hooks/usePlanGoals';
import {
    addDays,
    analyzeDayContent,
    evaluateGoals,
    usableFreeMinutes,
    type DayAnalysis,
} from '@/src/lib/schedules/free-time';
import { createClient } from '@/src/lib/supabase/client';

/** 予定を読む日数。目標の期日がこれより先なら、その先は予定の無い日（07:00〜23:30 が空き）として数える。 */
const HORIZON_DAYS = 120;
/** 日ごとの空きの一覧に出す日数。 */
const LIST_DAYS = 21;
/** 累積グラフの最低の幅（日）。目標の期日がこれより先なら期日の3日後まで伸ばす。 */
const CHART_MIN_DAYS = 21;
const LIFE_HOUR_OPTIONS = [0, 1, 2, 3, 4, 5, 6];
/** 読んだ範囲より先の日（予定の無い日）。 */
const EMPTY_DAY = analyzeDayContent('');

const CARD = 'rounded border border-neutral-400 bg-neutral-50 p-4 dark:border-neutral-600 dark:bg-neutral-900';

/** 長期の計画。目標（この日までにこれを終える）と、締切までに使える空きを比べる。 */
export default function PlanPage() {
    const supabase = useMemo(() => createClient(), []);
    const now = useNow();
    const [lifeHours, setLifeHours] = useLifeHours();
    const { goals, isLoading: goalsLoading, error: goalsError, reload: reloadGoals, addGoal, updateGoal, removeGoal } =
        usePlanGoals(supabase);
    const {
        contents,
        isLoading: contentsLoading,
        error: contentsError,
        reload: reloadContents,
    } = usePlanDayContents(supabase, now?.today ?? null, HORIZON_DAYS);

    const analyze = useMemo(() => {
        const analyses = new Map<string, DayAnalysis>();
        for (const [date, content] of contents) analyses.set(date, analyzeDayContent(content));
        return (date: string) => analyses.get(date) ?? EMPTY_DAY;
    }, [contents]);

    const statuses = useMemo(() => {
        if (!now) return [];
        return evaluateGoals({
            goals: goals.map(planGoalToInput),
            analyze,
            knownDates: [...contents.keys()],
            today: now.today,
            nowMinutes: now.nowMinutes,
            lifeMinutesPerDay: lifeHours * 60,
        });
    }, [goals, analyze, contents, now, lifeHours]);

    const chartDays = useMemo(() => {
        if (!now) return [];
        const lastDue = statuses.filter((s) => !s.past).reduce((m, s) => (s.goal.dueOn > m ? s.goal.dueOn : m), now.today);
        const days: CapacityDay[] = [];
        const end = lastDue > addDays(now.today, CHART_MIN_DAYS - 1) ? addDays(lastDue, 3) : addDays(now.today, CHART_MIN_DAYS - 1);
        for (let d = now.today; d <= end; d = addDays(d, 1)) {
            const a = analyze(d);
            days.push({
                date: d,
                usableMinutes: usableFreeMinutes(a, d === now.today ? now.nowMinutes : 0, 24 * 60, lifeHours * 60),
                wake: a.wake,
                sleep: a.sleep,
            });
        }
        return days;
    }, [now, statuses, analyze, lifeHours]);

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
                            statuses={statuses}
                            onAdd={handleAdd}
                            onUpdate={(id, patch) => void updateGoal(id, patch)}
                            onRemove={(id) => void removeGoal(id)}
                        />
                    </section>

                    <section className={`${CARD} space-y-2`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h2 className="text-base font-medium">締切までの時間</h2>
                            <div className="flex flex-wrap items-center gap-1 text-sm text-neutral-700 dark:text-neutral-300">
                                <span>生活の時間を1日</span>
                                {LIFE_HOUR_OPTIONS.map((h) => (
                                    <Button
                                        key={h}
                                        color={h === lifeHours ? 'secondary' : 'ghost'}
                                        size="icon"
                                        aria-pressed={h === lifeHours}
                                        onClick={() => setLifeHours(h)}
                                    >
                                        {h}
                                    </Button>
                                ))}
                                <span>時間 差し引く</span>
                            </div>
                        </div>
                        <p className="text-sm text-neutral-700 dark:text-neutral-300">
                            空きは起床〜消灯から予定を除いた時間で、食事・移動・風呂も含みます。差し引く時間は実感か実測で決めてください（この端末に保存）。
                        </p>
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
