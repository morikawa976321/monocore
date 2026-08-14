'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader } from '@/src/components/layout/PageHeader'
import { ArticleList } from '@/src/components/news/ArticleList'
import { SourceTabs } from '@/src/components/news/SourceTabs'
import { LoadingIndicator } from '@/src/components/ui/LoadingIndicator'
import { getDefaultTimezone } from '@/src/lib/date'
import { ALL_SOURCES_KEY, buildSourceTabs, filterBySource } from '@/src/lib/news/group'
import { createClient } from '@/src/lib/supabase/client'
import { getArticles, type ArticleListRow } from '@/src/lib/supabase/queries/articles'

export default function NewsPage() {
    const supabase = useMemo(() => createClient(), [])
    const timezone = useMemo(() => getDefaultTimezone(), [])
    const [articles, setArticles] = useState<ArticleListRow[]>([])
    const [activeSource, setActiveSource] = useState<string>(ALL_SOURCES_KEY)
    const [isInitialLoading, setIsInitialLoading] = useState(true)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    const loadArticles = useCallback(
        async (mode: 'initial' | 'refresh' = 'initial') => {
            if (mode === 'refresh') {
                setIsRefreshing(true)
            } else {
                setIsInitialLoading(true)
            }

            const { data, error } = await getArticles(supabase)

            if (error) {
                setErrorMessage('記事の読み込みに失敗しました。')
            } else {
                setArticles(data ?? [])
                setErrorMessage(null)
            }
            setIsInitialLoading(false)
            setIsRefreshing(false)
        },
        [supabase]
    )

    useEffect(() => {
        void loadArticles('initial')
    }, [loadArticles])

    const tabs = useMemo(() => buildSourceTabs(articles), [articles])
    const visibleArticles = useMemo(
        () => filterBySource(articles, activeSource),
        [articles, activeSource]
    )

    // 記事が入れ替わって選択中のソースが消えることがある(保持は8日)。
    // その場合は ALL に戻す。空のタブが選ばれたまま無言で0件になるのを避ける。
    useEffect(() => {
        if (!tabs.some((tab) => tab.key === activeSource)) {
            setActiveSource(ALL_SOURCES_KEY)
        }
    }, [tabs, activeSource])

    return (
        <div className="flex flex-col h-screen bg-neutral-100 dark:bg-neutral-950">
            <PageHeader
                title="News"
                onRefresh={() => void loadArticles('refresh')}
                isRefreshing={isRefreshing}
            >
                {errorMessage && (
                    <span className="text-sm text-amber-600 dark:text-amber-400">{errorMessage}</span>
                )}
            </PageHeader>

            <div className="flex-1 overflow-hidden relative">
                <div className="h-full overflow-y-auto px-2 sm:px-6 py-1 sm:py-4 space-y-2 sm:space-y-4">
                    {!isInitialLoading && articles.length > 0 && (
                        <SourceTabs tabs={tabs} activeKey={activeSource} onSelect={setActiveSource} />
                    )}

                    {!isInitialLoading && articles.length === 0 && (
                        <section className="rounded bg-neutral-50 dark:bg-neutral-900 overflow-hidden border border-neutral-400 dark:border-neutral-600">
                            <div className="p-1 sm:p-4">
                                <p className="text-neutral-900 dark:text-neutral-100">
                                    表示できる記事はありません。
                                </p>
                            </div>
                        </section>
                    )}

                    {!isInitialLoading && visibleArticles.length > 0 && (
                        <ArticleList articles={visibleArticles} timezone={timezone} />
                    )}
                </div>

                {isInitialLoading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-100/80 dark:bg-neutral-950/80">
                        <div className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800 rounded p-4">
                            <LoadingIndicator />
                            <span className="text-sm text-neutral-700 dark:text-neutral-300">同期中…</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
