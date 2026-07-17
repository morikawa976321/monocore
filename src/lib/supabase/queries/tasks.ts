import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database.types'

type TaskRow = Database['public']['Tables']['tasks']['Row']
type TaskInsert = Database['public']['Tables']['tasks']['Insert']
type TaskUpdate = Database['public']['Tables']['tasks']['Update']

export type TaskStatus = 'waiting' | 'completed' | 'deleted'

/**
 * 指定ステータスのタスク一覧を取得する。
 */
export async function getTasksByStatus(
    supabase: SupabaseClient<Database>,
    status: TaskStatus
): Promise<{ data: TaskRow[] | null; error: Error | null }> {
    let query = supabase.from('tasks').select('*').eq('status', status)

    if (status === 'waiting') {
        query = query.order('due_at', { ascending: true, nullsFirst: false })
    } else {
        query = query.order('created_at', { ascending: false })
    }

    const { data, error } = await query
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
 */
export async function updateTaskStatus(
    supabase: SupabaseClient<Database>,
    id: string,
    status: TaskStatus
): Promise<{ data: TaskRow | null; error: Error | null }> {
    const payload: TaskUpdate = {
        status,
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
