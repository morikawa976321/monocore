import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database.types'

export type DrainAskRow = Database['public']['Tables']['drain_asks']['Row']

/** 未対応(resolved_at が空)の依頼を新しい順に返す。済んだものは画面に出さない。 */
export async function getOpenDrainAsks(
    supabase: SupabaseClient<Database>
): Promise<{ data: DrainAskRow[] | null; error: PostgrestError | null }> {
    const { data, error } = await supabase
        .from('drain_asks')
        .select('id,source,title,detail,created_at,resolved_at')
        .is('resolved_at', null)
        .order('created_at', { ascending: false })
    return { data, error }
}

/** 依頼を「済」にする。画面から書き換えられる列は resolved_at だけ(列単位の GRANT)。 */
export async function resolveDrainAsk(
    supabase: SupabaseClient<Database>,
    id: string
): Promise<{ error: PostgrestError | null }> {
    const { error } = await supabase
        .from('drain_asks')
        .update({ resolved_at: new Date().toISOString() })
        .eq('id', id)
    return { error }
}
