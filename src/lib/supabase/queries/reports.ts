import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database.types'

type ReportRow = Database['public']['Tables']['reports']['Row']

// 一覧画面用の列だけを明示的に選ぶ。body_html(数MB相当になりうる)は含めない。
// 一覧を開くたびに全レポート本文がモバイル回線に飛ぶのを避けるのがこの面唯一の
// 性能上の急所なので select('*') は使わない。toc はタイトルと合わせた
// クライアント側の絞り込みに使うため含める(本文ほど重くないため実害が無い)。
export type ReportListRow = Pick<ReportRow, 'slug' | 'title' | 'updated_at' | 'toc'>

export async function getReportList(
    supabase: SupabaseClient<Database>
): Promise<{ data: ReportListRow[] | null; error: PostgrestError | null }> {
    const { data, error } = await supabase
        .from('reports')
        .select('slug,title,updated_at,toc')
        .order('updated_at', { ascending: false })
    return { data, error }
}

/**
 * レポートの版の目印(本文の指紋 body_md5 とタイトル・目次の updated_at)だけを読む。詳細ページは手元
 * (src/lib/reports/cache.ts)の本文と比べ、変わっていたときだけ本文を読む。レポートが無ければ data は null。
 * body_md5 は本文から DB が計算する列(migration 20261023210000)。updated_at は md の更新時刻なので本文の
 * 変化と一致しないことがあり、指紋と組で見る。
 */
export async function getReportVersion(
    supabase: SupabaseClient<Database>,
    slug: string
): Promise<{ data: string | null; error: PostgrestError | null }> {
    const { data, error } = await supabase
        .from('reports')
        .select('body_md5,updated_at')
        .eq('slug', slug)
        .maybeSingle()
    return { data: data ? reportVersion(data) : null, error }
}

/** getReportVersion と同じ形の目印を、読み込んだ行から作る。 */
export function reportVersion(row: Pick<ReportRow, 'body_md5' | 'updated_at'>): string {
    return `${row.body_md5 ?? ''}|${row.updated_at}`
}

export type ReportDetailRow = Pick<ReportRow, 'slug' | 'title' | 'body_html' | 'body_md5' | 'toc' | 'updated_at'>

export async function getReportBySlug(
    supabase: SupabaseClient<Database>,
    slug: string
): Promise<{ data: ReportDetailRow | null; error: PostgrestError | null }> {
    const { data, error } = await supabase
        .from('reports')
        .select('slug,title,body_html,body_md5,toc,updated_at')
        .eq('slug', slug)
        .maybeSingle()
    return { data, error }
}
