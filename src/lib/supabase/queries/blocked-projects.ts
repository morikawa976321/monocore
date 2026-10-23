import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database.types'

export type BlockedProjectRow = Database['public']['Tables']['blocked_projects']['Row']
export type BlockedProjectUpdate = Database['public']['Tables']['blocked_projects']['Update']

/** 止まっているプロジェクトを作った順に全件取得する。 */
export async function getBlockedProjects(
    supabase: SupabaseClient<Database>,
): Promise<{ data: BlockedProjectRow[] | null; error: PostgrestError | null }> {
    const { data, error } = await supabase
        .from('blocked_projects')
        .select('*')
        .order('created_at', { ascending: true })
    return { data, error }
}

/** 空のカードを1枚追加する。user_id は DEFAULT auth.uid() + RLS により自動設定。 */
export async function insertBlockedProject(
    supabase: SupabaseClient<Database>,
): Promise<{ data: BlockedProjectRow | null; error: PostgrestError | null }> {
    const { data, error } = await supabase.from('blocked_projects').insert({}).select('*').single()
    return { data, error }
}

/**
 * 読み込んだときの updated_at を条件に含める楽観ロック。AI(monocore スキル)や別タブが先に書いていれば
 * 0 行更新で data が null になり、他所で足されたタスクを古い本文で黙って上書きしない。
 */
export async function updateBlockedProject(
    supabase: SupabaseClient<Database>,
    id: string,
    loadedUpdatedAt: string,
    patch: BlockedProjectUpdate,
): Promise<{ data: BlockedProjectRow | null; error: PostgrestError | null }> {
    const { data, error } = await supabase
        .from('blocked_projects')
        .update(patch)
        .eq('id', id)
        .eq('updated_at', loadedUpdatedAt)
        .select('*')
        .maybeSingle()
    return { data, error }
}

export async function deleteBlockedProject(
    supabase: SupabaseClient<Database>,
    id: string,
): Promise<{ error: PostgrestError | null }> {
    const { error } = await supabase.from('blocked_projects').delete().eq('id', id)
    return { error }
}
