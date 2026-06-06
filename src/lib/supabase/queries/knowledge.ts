import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database.types'

type KnowledgeRow = Database['public']['Tables']['knowledge']['Row']

export type KnowledgeListRow = Pick<
    KnowledgeRow,
    'id' | 'title' | 'created_at' | 'updated_at' | 'sort_order'
>

/**
 * 一覧（body は取得しない）。sort_order 昇順（ユーザー定義順）。
 */
export async function listKnowledge(
    supabase: SupabaseClient<Database>,
    includeDeleted: boolean = false
): Promise<{ data: KnowledgeListRow[] | null; error: Error | null }> {
    const query = supabase
        .from('knowledge')
        .select('id, title, created_at, updated_at, sort_order')
        .order('sort_order', { ascending: true })

    if (!includeDeleted) {
        query.is('deleted_at', null)
    } else {
        query.not('deleted_at', 'is', null)
    }

    const { data, error } = await query

    return { data, error }
}

/**
 * 単体取得（body を含む全文）。
 */
export async function getKnowledgeById(
    supabase: SupabaseClient<Database>,
    id: string
): Promise<{ data: KnowledgeRow | null; error: Error | null }> {
    const { data, error } = await supabase
        .from('knowledge')
        .select('*')
        .eq('id', id)
        .maybeSingle()

    return { data, error }
}

/**
 * 新規作成。title / sort_order は DB トリガーが設定する。
 */
export async function createKnowledge(
    supabase: SupabaseClient<Database>,
    body: string
): Promise<{ data: KnowledgeRow | null; error: Error | null }> {
    const { data, error } = await supabase
        .from('knowledge')
        .insert({ body })
        .select('*')
        .single()

    return { data, error }
}

/**
 * 本文更新。title は DB トリガーが body から上書きする。
 */
export async function updateKnowledge(
    supabase: SupabaseClient<Database>,
    id: string,
    body: string
): Promise<{ data: KnowledgeRow | null; error: Error | null }> {
    const { data, error } = await supabase
        .from('knowledge')
        .update({ body })
        .eq('id', id)
        .is('deleted_at', null)
        .select('*')
        .single()

    return { data, error }
}

/**
 * 論理削除（deleted_at を現在時刻に設定）。
 */
export async function deleteKnowledge(
    supabase: SupabaseClient<Database>,
    id: string
): Promise<{ data: KnowledgeRow | null; error: Error | null }> {
    const deletedAt = new Date().toISOString()
    const { data, error } = await supabase
        .from('knowledge')
        .update({ deleted_at: deletedAt })
        .eq('id', id)
        .is('deleted_at', null)
        .select('*')
        .maybeSingle()

    return { data, error }
}

/**
 * 一覧順を更新。orderedIds の index が新しい sort_order。
 */
export async function reorderKnowledge(
    supabase: SupabaseClient<Database>,
    orderedIds: string[]
): Promise<{ error: Error | null }> {
    const updates = orderedIds.map((id, index) =>
        supabase
            .from('knowledge')
            .update({ sort_order: index })
            .eq('id', id)
            .is('deleted_at', null)
    )

    const results = await Promise.all(updates)
    const failed = results.find((r) => r.error)
    return { error: failed?.error ?? null }
}
