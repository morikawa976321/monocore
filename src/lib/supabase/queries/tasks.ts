import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database.types'

type TaskRow = Database['public']['Tables']['tasks']['Row']
type TaskInsert = Database['public']['Tables']['tasks']['Insert']
type TaskUpdate = Database['public']['Tables']['tasks']['Update']

export type TaskStatus = 'waiting' | 'completed' | 'archived' | 'deleted'

/**
 * 解除予定日時を過ぎたアーカイブタスクを未完了へ戻す（一覧取得前に呼ぶ）。
 */
export async function applyDueTaskUnarchives(
    supabase: SupabaseClient<Database>
): Promise<{ error: Error | null }> {
    const { error } = await supabase.rpc('apply_due_task_unarchives')
    return { error }
}

/**
 * 指定ステータスのタスク一覧を取得する。
 */
export async function getTasksByStatus(
    supabase: SupabaseClient<Database>,
    status: TaskStatus
): Promise<{ data: TaskRow[] | null; error: Error | null }> {
    const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('status', status)
        .order('created_at', { ascending: false })

    return { data, error }
}

/**
 * タスクを新規作成する。
 * due_at は呼び出し元で UTC ISO 文字列に変換して渡す。
 */
export async function createTask(
    supabase: SupabaseClient<Database>,
    task: string,
    due_at?: string | null
): Promise<{ data: TaskRow | null; error: Error | null }> {
    const payload: TaskInsert = {
        task,
        due_at: due_at ?? null,
        status: 'waiting',
    }

    const { data, error } = await supabase
        .from('tasks')
        .insert(payload)
        .select('*')
        .single()

    return { data, error }
}

/**
 * タスクステータスを更新する。
 * unarchive_at:
 * - undefined: 更新しない
 * - null: 明示的にクリアする
 * - string: UTC ISO 文字列として設定する
 */
export async function updateTaskStatus(
    supabase: SupabaseClient<Database>,
    id: string,
    status: TaskStatus,
    unarchive_at?: string | null
): Promise<{ data: TaskRow | null; error: Error | null }> {
    const payload: TaskUpdate = {
        status,
    }

    if (unarchive_at !== undefined) {
        payload.unarchive_at = unarchive_at
    }

    const { data, error } = await supabase
        .from('tasks')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single()

    return { data, error }
}

/** 
 * タスク内容と締め切りを更新する。
 * ステータスは変更しない。
 */
export async function updateTaskContent(
    supabase: SupabaseClient<Database>,
    id: string,
    task: string,
    due_at?: string | null
): Promise<{ data: TaskRow | null; error: Error | null }> {
    const payload: TaskUpdate = {
        task,
        due_at: due_at ?? null,
    }

    const { data, error } = await supabase
        .from('tasks')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single()

    return { data, error }
}