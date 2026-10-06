'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/src/types/database.types';
import {
    deletePlanGoal,
    getPlanGoals,
    insertPlanGoal,
    updatePlanGoal,
    type PlanGoalInsert,
    type PlanGoalRow,
    type PlanGoalUpdate,
} from '@/src/lib/supabase/queries/plan-goals';
import { utcToLocalTime } from '@/src/lib/date';
import { timeToMinutes, type GoalInput } from '@/src/lib/schedules/free-time';

/** DB の行を計算用の形に。「置いた時間」は目標を作った日（ローカル）から数える。 */
export function planGoalToInput(row: PlanGoalRow, timezone: string): GoalInput {
    return {
        id: row.id,
        name: row.name,
        dueOn: row.due_on,
        dueMinutes: timeToMinutes(row.due_time),
        needMinutes: row.need_minutes,
        countFrom: utcToLocalTime(row.created_at, timezone).date,
    };
}

/** 計画の目標の取得と編集。編集は画面へ先に反映し、保存に失敗したら読み直す。 */
export function usePlanGoals(supabase: SupabaseClient<Database>) {
    const [goals, setGoals] = useState<PlanGoalRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const reload = useCallback(async () => {
        const { data, error: e } = await getPlanGoals(supabase);
        if (e) {
            setError('目標の読み込みに失敗しました。');
        } else {
            setGoals(data ?? []);
            setError(null);
        }
        setIsLoading(false);
    }, [supabase]);

    useEffect(() => {
        void reload();
    }, [reload]);

    const addGoal = useCallback(
        async (goal: PlanGoalInsert) => {
            const { data, error: e } = await insertPlanGoal(supabase, goal);
            if (e || !data) {
                setError('目標の追加に失敗しました。');
                return;
            }
            setGoals((prev) => [...prev, data]);
            setError(null);
        },
        [supabase]
    );

    const updateGoal = useCallback(
        async (id: string, patch: PlanGoalUpdate) => {
            setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
            const { error: e } = await updatePlanGoal(supabase, id, patch);
            if (e) {
                setError('目標の保存に失敗しました。');
                void reload();
            }
        },
        [supabase, reload]
    );

    const removeGoal = useCallback(
        async (id: string) => {
            setGoals((prev) => prev.filter((g) => g.id !== id));
            const { error: e } = await deletePlanGoal(supabase, id);
            if (e) {
                setError('目標の削除に失敗しました。');
                void reload();
            }
        },
        [supabase, reload]
    );

    return { goals, isLoading, error, reload, addGoal, updateGoal, removeGoal };
}
