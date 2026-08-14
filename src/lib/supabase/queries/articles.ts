import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database.types'

export type ArticleRow = Database['public']['Tables']['articles']['Row']

// 一覧に出す列だけを明示的に選ぶ(reports.ts と同じ規律)。collected_at は
// 期限切れ削除のためだけの列で画面には出さないので取らない。
export type ArticleListRow = Pick<
    ArticleRow,
    'link' | 'source' | 'title' | 'published' | 'image_url'
>

// PostgREST の max_rows と同値。保持期間は8日で実測500〜600行なので1回で収まる。
// ここに達したら記事が保持期間ぶん出そろっていないことになるので、
// そのときは保持期間かこの面の設計(日付での絞り込み)を見直す。
const LIST_LIMIT = 1000

export async function getArticles(
    supabase: SupabaseClient<Database>
): Promise<{ data: ArticleListRow[] | null; error: PostgrestError | null }> {
    const { data, error } = await supabase
        .from('articles')
        .select('link,source,title,published,image_url')
        .order('published', { ascending: false, nullsFirst: false })
        .limit(LIST_LIMIT)
    return { data, error }
}
