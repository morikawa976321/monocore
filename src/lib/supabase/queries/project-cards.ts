import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database.types'

export type ProjectCardRow = Database['public']['Tables']['project_cards']['Row']

export async function getProjectCards(
    supabase: SupabaseClient<Database>
): Promise<{ data: ProjectCardRow[] | null; error: PostgrestError | null }> {
    const { data, error } = await supabase
        .from('project_cards')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('slug', { ascending: true })
    return { data, error }
}
