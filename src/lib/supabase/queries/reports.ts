import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database.types'

export type ReportRow = Database['public']['Tables']['reports']['Row']

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

export type ReportDetailRow = Pick<ReportRow, 'slug' | 'title' | 'body_html' | 'toc' | 'updated_at'>

export async function getReportBySlug(
    supabase: SupabaseClient<Database>,
    slug: string
): Promise<{ data: ReportDetailRow | null; error: PostgrestError | null }> {
    const { data, error } = await supabase
        .from('reports')
        .select('slug,title,body_html,toc,updated_at')
        .eq('slug', slug)
        .maybeSingle()
    return { data, error }
}
