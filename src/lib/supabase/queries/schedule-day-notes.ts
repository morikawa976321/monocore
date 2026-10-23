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

/**
 * 範囲内のメモの目印(行数といちばん新しい updated_at)。getSchedulesStamp と同じ考え方。メモは版を持たないので、
 * 先に始まって後から確定した upsert を見落とす隙間が残る(1文の upsert の取引の長さ、数ミリ秒程度)。
 */
export async function getScheduleDayNotesStamp(
    supabase: SupabaseClient<Database>,
    startDay: string,
    endDay: string,
): Promise<{ data: string | null; error: PostgrestError | null }> {
    const { data, count, error } = await supabase
        .from('schedule_day_notes')
        .select('updated_at', { count: 'exact' })
        .gte('day_key', startDay)
        .lte('day_key', endDay)
        .order('updated_at', { ascending: false })
        .limit(1)
    if (error) return { data: null, error }
    return { data: `${count ?? 0}|${data?.[0]?.updated_at ?? ''}`, error: null }
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
