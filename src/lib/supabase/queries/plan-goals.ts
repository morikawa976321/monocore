import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database.types'

export type PlanGoalRow = Database['public']['Tables']['plan_goals']['Row']
export type PlanGoalInsert = Database['public']['Tables']['plan_goals']['Insert']
export type PlanGoalUpdate = Database['public']['Tables']['plan_goals']['Update']

/** 目標を期日の早い順に全件取得する。 */
export async function getPlanGoals(
    supabase: SupabaseClient<Database>,
): Promise<{ data: PlanGoalRow[] | null; error: PostgrestError | null }> {
    const { data, error } = await supabase
        .from('plan_goals')
        .select('*')
        .order('due_on', { ascending: true })
        .order('due_time', { ascending: true, nullsFirst: false })
    return { data, error }
}

/** 目標を1件追加する。user_id は DEFAULT auth.uid() + RLS により自動設定。 */
export async function insertPlanGoal(
    supabase: SupabaseClient<Database>,
    goal: PlanGoalInsert,
): Promise<{ data: PlanGoalRow | null; error: PostgrestError | null }> {
    const { data, error } = await supabase.from('plan_goals').insert(goal).select('*').single()
    return { data, error }
}

export async function updatePlanGoal(
    supabase: SupabaseClient<Database>,
    id: string,
    patch: PlanGoalUpdate,
): Promise<{ error: PostgrestError | null }> {
    const { error } = await supabase.from('plan_goals').update(patch).eq('id', id)
    return { error }
}

export async function deletePlanGoal(
    supabase: SupabaseClient<Database>,
    id: string,
): Promise<{ error: PostgrestError | null }> {
    const { error } = await supabase.from('plan_goals').delete().eq('id', id)
    return { error }
}
