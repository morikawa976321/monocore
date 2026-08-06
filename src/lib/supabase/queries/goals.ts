import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database.types'

export type GoalRow = Database['public']['Tables']['goals']['Row']

export async function getGoals(
    supabase: SupabaseClient<Database>
): Promise<{ data: GoalRow[] | null; error: PostgrestError | null }> {
    const { data, error } = await supabase
        .from('goals')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('slug', { ascending: true })
    return { data, error }
}
