import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database.types'

type InboxRow = Database['public']['Tables']['inboxes']['Row']

export async function getInbox(
    supabase: SupabaseClient<Database>,
): Promise<{ data: InboxRow | null; error: Error | null }> {
    const { data, error } = await supabase
        .from('inboxes')
        .select('*')
        .maybeSingle()

    return { data, error }
}

/**
 * Inbox の内容を更新する。レコードがなければ作成（upsert）。
 * user_id は RLS + DEFAULT auth.uid() により自動設定。
 */
export async function upsertInbox(
    supabase: SupabaseClient<Database>,
    content: string,
): Promise<{ error: Error | null }> {
    const { error } = await supabase
        .from('inboxes')
        .upsert({ content }, { onConflict: 'user_id' })

    return { error }
}
