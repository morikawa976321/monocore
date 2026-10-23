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

/** Inbox の updated_at だけを読む(タブに戻ったときの変更の問い合わせ。本文は変わっていたときだけ読む)。 */
export async function getInboxUpdatedAt(
    supabase: SupabaseClient<Database>,
): Promise<{ data: string | null; error: Error | null }> {
    const { data, error } = await supabase.from('inboxes').select('updated_at').maybeSingle()
    return { data: data?.updated_at ?? null, error }
}

/**
 * Inbox の内容を更新する。レコードがなければ作成（upsert）。
 * user_id は RLS + DEFAULT auth.uid() により自動設定。
 */
export async function upsertInbox(
    supabase: SupabaseClient<Database>,
    content: string,
): Promise<{ updatedAt: string | null; error: Error | null }> {
    // 保存後の updated_at を返す(自分の保存を、タブに戻ったときの変更の問い合わせで「変わった」と数えないため)。
    const { data, error } = await supabase
        .from('inboxes')
        .upsert({ content }, { onConflict: 'user_id' })
        .select('updated_at')
        .single()

    return { updatedAt: data?.updated_at ?? null, error }
}
