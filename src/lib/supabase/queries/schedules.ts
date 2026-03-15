import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database.types'

type ScheduleRow = Database['public']['Tables']['schedules']['Row']

/**
 * 指定した時間範囲内のスケジュールを取得する。
 * schedules テーブルから、start_at が options.start_at 以上かつ options.end_at 未満の行を、
 * start_at の昇順で返す。
 */
export async function getSchedules(
    supabase: SupabaseClient<Database>,
    activity: string,
    start_at: string,
    end_at: string,
): Promise<{ data: ScheduleRow[] | null; error: Error | null }> {
    const { data, error } = await supabase
        .from('schedules')
        .select('*')
        .gte('start_at', start_at)
        .lt('start_at', end_at)
        .order('start_at', { ascending: true })
    return { data, error }
}

/** 1件分のスケジュール。start_at / end_at は UTC の ISO 文字列であること（呼び出し元で変換する）。 */
export type ReplaceScheduleItem = {
    activity: string
    start_at: string
    end_at: string | null
}

/**
 * 指定日のスケジュールを一括で置き換える。
 * day_start_utc / day_end_utc および各 item の start_at / end_at は
 * 呼び出し元で UTC に変換してから渡すこと。その日の該当範囲内の既存スケジュールは削除され、
 * 渡した items が新規登録される。
 */
export async function replaceSchedulesForDay(
    supabase: SupabaseClient<Database>,
    day_start_utc: string,
    day_end_utc: string,
    items: ReplaceScheduleItem[]
): Promise<{ data: undefined; error: Error | null }> {
    const { error } = await supabase.rpc('replace_schedules_for_day', {
        p_day_start_utc: day_start_utc,
        p_day_end_utc: day_end_utc,
        p_items: items,
    })
    return { data: undefined, error }
}
