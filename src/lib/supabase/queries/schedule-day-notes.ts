import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database.types'
import { PAGE_ROWS } from './schedules'

// 画面が使う列だけ(user_id・updated_at は読まない)。
type ScheduleDayNoteRow = Pick<Database['public']['Tables']['schedule_day_notes']['Row'], 'day_key' | 'body'>

/** day_key が startDay 以上 endDay 以下のメモを取得する。 */
export async function getScheduleDayNotes(
    supabase: SupabaseClient<Database>,
    startDay: string,
    endDay: string,
): Promise<{ data: ScheduleDayNoteRow[] | null; error: PostgrestError | null }> {
    const { data, error } = await supabase
        .from('schedule_day_notes')
        .select('day_key,body')
        .gte('day_key', startDay)
        .lte('day_key', endDay)
        .order('day_key', { ascending: true })
    return { data, error }
}

/**
 * 範囲内のメモの目印: 日ごとの day_key と updated_at をつないだ文字列(`日:updated_at,…`、日の昇順)。メモは版を
 * 持たないので updated_at が頼りで、先に始まって後から確定した upsert を見落とす隙間が残る(1文の upsert の
 * 取引の長さ、数ミリ秒程度)。行数と最新の updated_at だけにしないのは、無限スクロールで範囲を広げたとき、
 * 隣り合う範囲の目印を合成して範囲全体の目印にするため(src/lib/schedules/stamp.ts)。最新の updated_at だけだと、
 * 広げた分の新しい編集に旧範囲の編集が隠れる。メモは消さない(DELETE の権限が無い)ので、行は増えるだけ。
 */
export async function getScheduleDayNotesStamp(
    supabase: SupabaseClient<Database>,
    startDay: string,
    endDay: string,
): Promise<{ data: string | null; error: PostgrestError | null }> {
    // 1日1行で、範囲が 1000 日を超えると max_rows で切れる。目印が切れると後ろの日の編集を見落とすので、
    // 切れないようページを分けて読む。
    const parts: string[] = []
    for (let offset = 0; ; ) {
        const { data, error } = await supabase
            .from('schedule_day_notes')
            .select('day_key,updated_at')
            .gte('day_key', startDay)
            .lte('day_key', endDay)
            .order('day_key', { ascending: true })
            .range(offset, offset + PAGE_ROWS - 1)
        if (error) return { data: null, error }
        if (!data || data.length === 0) return { data: parts.join(','), error: null }
        for (const r of data) parts.push(`${r.day_key}:${r.updated_at}`)
        if (data.length < PAGE_ROWS) return { data: parts.join(','), error: null }
        offset += data.length
    }
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
