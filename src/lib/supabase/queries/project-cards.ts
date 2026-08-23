import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database.types'

export type ProjectCardRow = Database['public']['Tables']['project_cards']['Row']

export async function getProjectCards(
    supabase: SupabaseClient<Database>
): Promise<{ data: ProjectCardRow[] | null; error: PostgrestError | null }> {
    // 完了したカードは行ごと削除する運用のため、doneを除外するフィルタは無い
    // （2026-08-23・statusカラム全廃。板はアーカイブではなく「今読むべきものだけを
    // 出す面」— [[frozen-project-with-low-thaw-chance-leaves-board]]）。
    const { data, error } = await supabase
        .from('project_cards')
        .select('*')
        .order('priority', { ascending: false })
        .order('slug', { ascending: true })
    return { data, error }
}
