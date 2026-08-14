import type { ArticleListRow } from '@/src/lib/supabase/queries/articles'

/** 「すべて」タブのキー。ソース名と衝突しないよう空文字を使う。 */
export const ALL_SOURCES_KEY = ''
export const ALL_SOURCES_LABEL = 'ALL'

export type SourceTab = {
    key: string
    label: string
    count: number
}

/**
 * ソース別タブを作る。ALL が先頭で、以降は記事の並び順（published の新しい順）で
 * 最初に現れたソースから並ぶ。
 *
 * ソース名でソートしないのは、直近に更新のあったサイトが左に来るほうが
 * 「何が動いているか」を読み取れるため（旧 news_scraping の挙動でもある）。
 */
export function buildSourceTabs(articles: ArticleListRow[]): SourceTab[] {
    const counts = new Map<string, number>()
    for (const article of articles) {
        const source = article.source || 'その他'
        counts.set(source, (counts.get(source) ?? 0) + 1)
    }

    const tabs: SourceTab[] = [
        { key: ALL_SOURCES_KEY, label: ALL_SOURCES_LABEL, count: articles.length },
    ]
    for (const [source, count] of counts) {
        tabs.push({ key: source, label: source, count })
    }
    return tabs
}

export function filterBySource(articles: ArticleListRow[], sourceKey: string): ArticleListRow[] {
    if (sourceKey === ALL_SOURCES_KEY) return articles
    return articles.filter((article) => (article.source || 'その他') === sourceKey)
}

/**
 * http/https の URL だけを通す。
 *
 * 記事の link と image_url は外部サイトの RSS / OGP メタタグ由来であり、
 * こちらで内容を検証していない。React はテキストはエスケープするが
 * href/src に入った `javascript:` は防いでくれないので、ここで落とす
 * （旧 news_scraping で同じ穴を塞いだ経緯がある）。
 */
export function isSafeHttpUrl(url: string | null | undefined): boolean {
    if (!url) return false
    try {
        const parsed = new URL(url)
        return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
        return false
    }
}
