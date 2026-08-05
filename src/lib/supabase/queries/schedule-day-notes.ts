import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database.types'

type ScheduleDayNoteRow = Database['public']['Tables']['schedule_day_notes']['Row']

/** day_key が startDay 以上 endDay 以下のメモを取得する。 */
export async function getScheduleDayNotes(
    supabase: SupabaseClient<Database>,
    startDay: string,
    endDay: string,
): Promise<{ data: ScheduleDayNoteRow[] | null; error: PostgrestError | null }> {
    const { data, error } = await supabase
        .from('schedule_day_notes')
        .select('*')
        .gte('day_key', startDay)
        .lte('day_key', endDay)
        .order('day_key', { ascending: true })
    return { data, error }
}

/** 指定日のメモ本文を upsert する。user_id は DEFAULT auth.uid() + RLS により自動設定。 */
export async function upsertScheduleDayNote(
    supabase: SupabaseClient<Database>,
    dayKey: string,
    body: string,
): Promise<{ error: PostgrestError | null }> {
    const { error } = await supabase
        .from('schedule_day_notes')
        .upsert({ day_key: dayKey, body }, { onConflict: 'user_id,day_key' })
    return { error }
}
