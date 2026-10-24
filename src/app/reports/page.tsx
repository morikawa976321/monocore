'use client'

import { format, parseISO } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader } from '@/src/components/layout/PageHeader'
import { Input } from '@/src/components/ui/Input'
import { LoadingIndicator } from '@/src/components/ui/LoadingIndicator'
import { getDefaultTimezone } from '@/src/lib/date'
import { matchesReportQuery, parseToc, type TocEntry } from '@/src/lib/reports/toc'
import { createClient } from '@/src/lib/supabase/client'
import { getReportList } from '@/src/lib/supabase/queries/reports'

type ParsedReport = {
    slug: string
    title: string
    updatedAt: string
    toc: TocEntry[]
}

export default function ReportsPage() {
    const supabase = useMemo(() => createClient(), [])
    const timezone = useMemo(() => getDefaultTimezone(), [])
    const [reports, setReports] = useState<ParsedReport[]>([])
    const [query, setQuery] = useState('')
    const [isInitialLoading, setIsInitialLoading] = useState(true)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    const loadReports = useCallback(
        async (mode: 'initial' | 'refresh' = 'initial') => {
            if (mode === 'refresh') {
                setIsRefreshing(true)
            } else {
                setIsInitialLoading(true)
            }

            const { data, error } = await getReportList(supabase)

            if (error) {
                setErrorMessage('レポート一覧の読み込みに失敗しました。')
                setIsInitialLoading(false)
                setIsRefreshing(false)
                return
            }

            setReports(
                (data ?? []).map((row) => ({
                    slug: row.slug,
                    title: row.title,
                    updatedAt: row.updated_at,
                    toc: parseToc(row.toc),
                }))
            )
            setErrorMessage(null)
            setIsInitialLoading(false)
            setIsRefreshing(false)
        },
        [supabase]
    )

    useEffect(() => {
        void loadReports('initial')
    }, [loadReports])

    const filteredReports = useMemo(
        () => reports.filter((report) => matchesReportQuery(query, report.title, report.toc)),
        [reports, query]
    )

    return (
        <div className="flex flex-col h-screen bg-neutral-250 dark:bg-neutral-900">
            <PageHeader
                title="Reports"
                onRefresh={() => void loadReports('refresh')}
                isRefreshing={isRefreshing}
            >
                {isInitialLoading && (
                    <div className="inline-flex items-center gap-2">
                        <LoadingIndicator />
                        <span className="text-sm text-neutral-700 dark:text-neutral-300">同期中…</span>
                    </div>
                )}
                {errorMessage && (
                    <span className="text-sm text-amber-600 dark:text-amber-400">{errorMessage}</span>
                )}
            </PageHeader>

            <div className="flex-1 overflow-hidden relative">
                <div className="h-full overflow-y-auto px-2 sm:px-6 py-1 sm:py-4 space-y-2 sm:space-y-4">
                    {!isInitialLoading && (
                        <Input
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="タイトル・見出しで絞り込み"
                            aria-label="レポートを絞り込む"
                        />
                    )}

                    {!isInitialLoading && reports.length === 0 && (
                        <section className="rounded bg-neutral-200 dark:bg-neutral-800 overflow-hidden border border-neutral-400 dark:border-neutral-600">
                            <div className="p-1 sm:p-4">
                                <p className="text-neutral-900 dark:text-neutral-100">
                                    表示できるレポートはありません。
                                </p>
                            </div>
                        </section>
                    )}

                    {!isInitialLoading && reports.length > 0 && filteredReports.length === 0 && (
                        <section className="rounded bg-neutral-200 dark:bg-neutral-800 overflow-hidden border border-neutral-400 dark:border-neutral-600">
                            <div className="p-1 sm:p-4">
                                <p className="text-neutral-900 dark:text-neutral-100">
                                    「{query}」に一致するレポートはありません。
                                </p>
                            </div>
                        </section>
                    )}

                    {!isInitialLoading && filteredReports.length > 0 && (
                        <ul className="space-y-2 sm:space-y-4">
                            {filteredReports.map((report) => (
                                <li key={report.slug}>
                                    <Link
                                        href={`/reports/${report.slug}`}
                                        className="flex items-center justify-between gap-2 rounded bg-neutral-200 dark:bg-neutral-800 overflow-hidden border border-neutral-400 dark:border-neutral-600 px-2 sm:px-4 py-2 text-sm leading-6 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition-colors duration-150 ease-in-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-500"
                                    >
                                        <span className="min-w-0 truncate text-neutral-900 dark:text-neutral-50">
                                            {report.title}
                                        </span>
                                        <span className="shrink-0 text-neutral-700 dark:text-neutral-300">
                                            {format(toZonedTime(parseISO(report.updatedAt), timezone), 'yyyy-MM-dd')}
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {isInitialLoading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-250/80 dark:bg-neutral-900/80">
                        <div className="flex items-center gap-2 bg-neutral-200 border border-neutral-300 dark:bg-neutral-800 dark:border-neutral-700 rounded p-4">
                            <LoadingIndicator />
                            <span className="text-sm text-neutral-700 dark:text-neutral-300">同期中…</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
