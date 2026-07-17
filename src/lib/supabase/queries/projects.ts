import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database.types'

type ProjectRow = Database['public']['Tables']['projects']['Row']
type ProjectUpdate = Database['public']['Tables']['projects']['Update']

export type ProjectStatus = 'active' | 'completed' | 'deleted'

export type ProjectListRow = Pick<
    ProjectRow,
    'id' | 'title' | 'created_at' | 'updated_at' | 'sort_order' | 'status' | 'status_changed_at'
>

/**
 * 一覧（body は取得しない）。sort_order 昇順（ユーザー定義順）。
 */
export async function listProjects(
    supabase: SupabaseClient<Database>,
    status: ProjectStatus
): Promise<{ data: ProjectListRow[] | null; error: Error | null }> {
    const { data, error } = await supabase
        .from('projects')
        .select('id, title, created_at, updated_at, sort_order, status, status_changed_at')
        .eq('status', status)
        .order('sort_order', { ascending: true })

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
        .maybeSingle()

    return { data, error }
}

/**
 * 新規作成。title / sort_order は DB トリガーが設定する。
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
        .eq('status', 'active')
        .select('*')
        .single()

    return { data, error }
}

/**
 * 状態を更新する。status_changed_at は DB トリガーが設定する。
 */
export async function updateProjectStatus(
    supabase: SupabaseClient<Database>,
    id: string,
    status: ProjectStatus
): Promise<{ data: ProjectRow | null; error: Error | null }> {
    const payload: ProjectUpdate = { status }
    const { data, error } = await supabase
        .from('projects')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single()

    return { data, error }
}

/**
 * 一覧順を更新。orderedIds の index が新しい sort_order。
 */
export async function reorderProjects(
    supabase: SupabaseClient<Database>,
    orderedIds: string[]
): Promise<{ error: Error | null }> {
    const updates = orderedIds.map((id, index) =>
        supabase
            .from('projects')
            .update({ sort_order: index })
            .eq('id', id)
            .eq('status', 'active')
    )

    const results = await Promise.all(updates)
    const failed = results.find((r) => r.error)
    return { error: failed?.error ?? null }
}
