'use client'

import { format, parseISO } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { useState } from 'react'
import { isSafeHttpUrl } from '@/src/lib/news/group'
import type { ArticleListRow } from '@/src/lib/supabase/queries/articles'

function formatPublished(published: string | null, timezone: string): string {
    if (!published) return ''
    try {
        return format(toZonedTime(parseISO(published), timezone), 'yyyy-MM-dd HH:mm')
    } catch {
        return ''
    }
}

/** サムネイル。読み込みに失敗したら「画像なし」に差し替える(旧UIの挙動)。 */
function Thumbnail({ src, alt }: { src: string | null; alt: string }) {
    const [hasFailed, setHasFailed] = useState(false)
    const isUsable = isSafeHttpUrl(src) && !hasFailed

    if (!isUsable) {
        return (
            <div className="flex w-40 h-24 shrink-0 items-center justify-center border border-neutral-400 dark:border-neutral-600 bg-neutral-100 dark:bg-neutral-950">
                <span className="text-sm text-neutral-700 dark:text-neutral-300">画像なし</span>
            </div>
        )
    }

    return (
        // next/image を使わないのは、外部ドメインの許可設定が要るうえに
        // この面に最適化(リサイズ・遅延生成)の必要が無いため。
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={src ?? ''}
            alt={alt}
            loading="lazy"
            onError={() => setHasFailed(true)}
            className="w-40 h-24 shrink-0 border border-neutral-400 dark:border-neutral-600 object-cover"
        />
    )
}

function ArticleCard({ article, timezone }: { article: ArticleListRow; timezone: string }) {
    const publishedAt = formatPublished(article.published, timezone)
    const isLinkUsable = isSafeHttpUrl(article.link)

    const body = (
        <>
            <Thumbnail src={article.image_url} alt="" />
            <div className="flex min-w-0 flex-col gap-1">
                <span className="text-neutral-900 dark:text-neutral-50">{article.title}</span>
                <span className="text-sm text-neutral-700 dark:text-neutral-300">
                    {article.source}
                    {publishedAt && ` ・ ${publishedAt}`}
                </span>
            </div>
        </>
    )

    // リンクが http/https でない記事も、読めなくする理由は無いので本文だけ出す。
    if (!isLinkUsable) {
        return (
            <div className="flex items-start gap-2 rounded border border-neutral-400 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-900 p-2">
                {body}
            </div>
        )
    }

    return (
        <a
            href={article.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-2 rounded border border-neutral-400 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-900 p-2 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors duration-150 ease-in-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-500"
        >
            {body}
        </a>
    )
}

export function ArticleList({
    articles,
    timezone,
}: {
    articles: ArticleListRow[]
    timezone: string
}) {
    return (
        <ul className="space-y-2 sm:space-y-4">
            {articles.map((article) => (
                <li key={article.link}>
                    <ArticleCard article={article} timezone={timezone} />
                </li>
            ))}
        </ul>
    )
}
