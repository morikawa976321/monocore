import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database.types'

type ScheduleRow = Pick<Database['public']['Tables']['schedules']['Row'], 'activity' | 'start_at' | 'end_at'>
type ScheduleDayRevisionRow = Database['public']['Tables']['schedule_day_revisions']['Row']

/**
 * 指定した時間範囲内のスケジュールを取得する。
 * schedules テーブルから、start_at が options.start_at 以上かつ options.end_at 未満の行を、
 * start_at の昇順で返す。画面が使う activity / start_at / end_at だけを読む（id・user_id・日時の列は使わない）。
 */
export async function getSchedules(
    supabase: SupabaseClient<Database>,
    start_at: string,
    end_at: string,
): Promise<{ data: ScheduleRow[] | null; error: Error | null }> {
    const { data, error } = await supabase
        .from('schedules')
        .select('activity,start_at,end_at')
        .gte('start_at', start_at)
        .lt('start_at', end_at)
        .order('start_at', { ascending: true })
    return { data, error }
}

/**
 * 範囲内の予定の「版の目印」: 行数といちばん新しい updated_at をつないだ文字列。タブに戻ったときに
 * これだけを問い合わせ、前に読んだときと同じなら予定を読み直さない。予定の保存は画面も AI
 * (replace_schedules_for_day / _as)も「その日の行を消して入れ直す」なので、書き込めば新しい updated_at の
 * 行ができて目印が変わる。消しただけの場合は updated_at が変わらないことがあるので行数も見る。
 * schedule_day_revisions は AI の書き込みで進まない(monocore#1)ので目印に使わない。
 */
export async function getSchedulesStamp(
    supabase: SupabaseClient<Database>,
    start_at: string,
    end_at: string,
): Promise<{ data: string | null; error: Error | null }> {
    const { data, count, error } = await supabase
        .from('schedules')
        .select('updated_at', { count: 'exact' })
        .gte('start_at', start_at)
        .lt('start_at', end_at)
        .order('updated_at', { ascending: false })
        .limit(1)
    if (error) return { data: null, error }
    return { data: `${count ?? 0}|${data?.[0]?.updated_at ?? ''}`, error: null }
}

/** PostgREST の1レスポンスの上限（supabase/config.toml の max_rows）。 */
const PAGE_ROWS = 1000

/**
 * startDay〜endDay（両端含む）のうち、スケジュール画面が既定予定を書き込んだ記録
 * （default_schedule_applications）のある日。空き時間の計算で、既定の起床・消灯を補うかを決める。
 * 1日に既定予定の数だけ行があるので、max_rows で切れないようページを分けて読む。
 */
export async function getDefaultAppliedDays(
    supabase: SupabaseClient<Database>,
    startDay: string,
    endDay: string,
): Promise<{ data: Set<string> | null; error: PostgrestError | null }> {
    const days = new Set<string>()
    for (let offset = 0; ; ) {
        const { data, error } = await supabase
            .from('default_schedule_applications')
            .select('day_key')
            .gte('day_key', startDay)
            .lte('day_key', endDay)
            .order('day_key', { ascending: true })
            .order('default_schedule_id', { ascending: true })
            .range(offset, offset + PAGE_ROWS - 1)
        if (error) return { data: null, error }
        if (!data || data.length === 0) return { data: days, error: null }
        for (const row of data) days.add(row.day_key)
        offset += data.length
    }
}

export async function getScheduleDayRevisions(
    supabase: SupabaseClient<Database>,
    startDay: string,
    endDay: string,
): Promise<{ data: ScheduleDayRevisionRow[] | null; error: PostgrestError | null }> {
    const { data, error } = await supabase
        .from('schedule_day_revisions')
        .select('*')
        .gte('day_key', startDay)
        .lte('day_key', endDay)
        .order('day_key', { ascending: true })
    return { data, error }
}

/**
 * startDay〜endDay（両端含む、YYYY-MM-DD のローカル日付）へ、まだ入れていない既定予定を書き込む。
 * 戻り値は予定を1件以上足した日の数。その日の revision も進むので、呼び出し側は
 * これを待ってから getSchedules / getScheduleDayRevisions を読むこと。
 */
export async function applyDefaultSchedules(
    supabase: SupabaseClient<Database>,
    startDay: string,
    endDay: string,
    timezone: string,
): Promise<{ data: number | null; error: PostgrestError | null }> {
    const { data, error } = await supabase.rpc('apply_default_schedules', {
        p_start_day: startDay,
        p_end_day: endDay,
        p_timezone: timezone,
    })
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
    day_key: string,
    day_start_utc: string,
    day_end_utc: string,
    expected_revision: number,
    items: ReplaceScheduleItem[]
): Promise<{ data: number | null; error: PostgrestError | null }> {
    const { data, error } = await supabase.rpc('replace_schedules_for_day', {
        p_day_key: day_key,
        p_day_start_utc: day_start_utc,
        p_day_end_utc: day_end_utc,
        p_expected_revision: expected_revision,
        p_items: items,
    })
    return { data, error }
}
