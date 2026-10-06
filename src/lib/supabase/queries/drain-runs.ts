import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database.types'

export type DrainRunRow = Database['public']['Tables']['drain_runs']['Row']

// 一覧では report_text(セッションの最終報告の全文・数KB)を含めない。
// 一覧を開くたびに全枠の散文がモバイル回線に飛ぶのを避ける、というのは
// reports 一覧と同じ判断で、この面唯一の性能上の急所。全文はカードを開いたときだけ取る。
export type DrainRunListRow = Omit<DrainRunRow, 'report_text' | 'created_at'>

const LIST_COLUMNS =
    'started_at,ended_at,outcome,trigger_reasons,model,effort,exit_code,steps,tasks,skip_count,skip_since'

/** 一覧の件数。投入スクリプトの保持上限も同じ値（scripts/upsert-drain-run.mjs）。
 *  taskbox drainが1日4回(6時間おき)から1時間おきへ変更されたのに伴い、
 *  2026-09-11に40から48(=1時間おき24枠の2日分)へ引き上げた（ユーザー指定の切りのよい数）。 */
export const DRAIN_RUNS_LIST_LIMIT = 48

export async function getDrainRuns(
    supabase: SupabaseClient<Database>,
    limit = DRAIN_RUNS_LIST_LIMIT
): Promise<{ data: DrainRunListRow[] | null; error: PostgrestError | null }> {
    const { data, error } = await supabase
        .from('drain_runs')
        .select(LIST_COLUMNS)
        .order('started_at', { ascending: false })
        .limit(limit)
    return { data, error }
}

export async function getDrainRunReport(
    supabase: SupabaseClient<Database>,
    startedAt: string
): Promise<{ data: string | null; error: PostgrestError | null }> {
    const { data, error } = await supabase
        .from('drain_runs')
        .select('report_text')
        .eq('started_at', startedAt)
        .maybeSingle()
    return { data: data?.report_text ?? null, error }
}
