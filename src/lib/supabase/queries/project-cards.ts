import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database.types'

export type ProjectCardRow = Database['public']['Tables']['project_cards']['Row']

export async function getProjectCards(
    supabase: SupabaseClient<Database>
): Promise<{ data: ProjectCardRow[] | null; error: PostgrestError | null }> {
    // 板の取得対象から done を外す（2026-08-10・本人指示）。
    // done は畳んで残すのではなくアクセス経路自体をなくす対象なので、
    // 表示側で捨てるのではなくここで取得しない。DBの行そのものは消さない。
    const { data, error } = await supabase
        .from('project_cards')
        .select('*')
        .neq('status', 'done')
        .order('sort_order', { ascending: true })
        .order('slug', { ascending: true })
    return { data, error }
}
