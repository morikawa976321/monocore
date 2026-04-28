import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database.types'

type ProjectRow = Database['public']['Tables']['projects']['Row']
type ProjectInsert = Database['public']['Tables']['projects']['Insert']

export type ProjectListRow = Pick<ProjectRow, 'id' | 'title' | 'created_at' | 'updated_at'>

/**
 * 一覧（body は取得しない）。更新日時の新しい順。
 */
export async function listProjects(
    supabase: SupabaseClient<Database>,
    includeDeleted: boolean = false
): Promise<{ data: ProjectListRow[] | null; error: Error | null }> {
    const query = supabase
        .from('projects')
        .select('id, title, created_at, updated_at')
        .order('updated_at', { ascending: false })

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
export async function getProjectById(
    supabase: SupabaseClient<Database>,
    id: string
): Promise<{ data: ProjectRow | null; error: Error | null }> {
    const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle()

    return { data, error }
}

/**
 * 新規作成。title は DB トリガーが body から設定する。
 */
export async function createProject(
    supabase: SupabaseClient<Database>,
    body: string
): Promise<{ data: ProjectRow | null; error: Error | null }> {
    const { data, error } = await supabase
        .from('projects')
        .insert({ body })
        .select('*')
        .single()

    return { data, error }
}

/**
 * 本文更新。title は DB トリガーが body から上書きする。
 */
export async function updateProject(
    supabase: SupabaseClient<Database>,
    id: string,
    body: string
): Promise<{ data: ProjectRow | null; error: Error | null }> {
    const { data, error } = await supabase
        .from('projects')
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
export async function deleteProject(
    supabase: SupabaseClient<Database>,
    id: string
): Promise<{ data: ProjectRow | null; error: Error | null }> {
    const deletedAt = new Date().toISOString()
    const { data, error } = await supabase
        .from('projects')
        .update({ deleted_at: deletedAt })
        .eq('id', id)
        .is('deleted_at', null)
        .select('*')
        .maybeSingle()

    return { data, error }
}
