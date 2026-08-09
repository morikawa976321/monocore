'use client'

import { ArrowLeft, List, X } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PageHeader } from '@/src/components/layout/PageHeader'
import { LoadingIndicator } from '@/src/components/ui/LoadingIndicator'
import { parseToc, tocForDisplay, type TocEntry } from '@/src/lib/reports/toc'
import { createClient } from '@/src/lib/supabase/client'
import { getReportBySlug } from '@/src/lib/supabase/queries/reports'

type ReportDetail = {
    slug: string
    title: string
    bodyHtml: string
    toc: TocEntry[]
}

// 目次はh1〜h3のみ。README-design.mdの余白スケール(1/2/4/6/12)に合わせる。
const TOC_INDENT_CLASS: Record<number, string> = {
    1: 'pl-0',
    2: 'pl-2',
    3: 'pl-4',
}

function scrollStorageKey(slug: string) {
    return `mf-reports-scroll:${slug}`
}

function ReportToc({
    toc,
    onNavigate,
    className = '',
}: {
    toc: TocEntry[]
    onNavigate?: () => void
    className?: string
}) {
    return (
        <ul className={`space-y-1 text-sm leading-6 ${className}`}>
            {toc.map((entry, index) => (
                <li key={`${entry.anchor}-${index}`} className={TOC_INDENT_CLASS[entry.level] ?? 'pl-0'}>
                    <a
                        href={`#${entry.anchor}`}
                        onClick={onNavigate}
                        className="block truncate rounded-sm px-2 py-1 text-neutral-800 transition-colors duration-150 ease-in-out hover:bg-neutral-200 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 dark:text-neutral-200 dark:hover:bg-neutral-800 dark:hover:text-neutral-50 dark:focus-visible:ring-neutral-600"
                    >
                        {entry.text}
                    </a>
                </li>
            ))}
        </ul>
    )
}

/**
 * レポート本文ページ。目次(sticky)＋本文(dangerouslySetInnerHTML)。
 * 本文は分割しない(1ページに全文)。各セクションは同期スクリプト側で
 * <section>にラップ済みで、content-visibility等はglobals.cssの
 * `.report-body section` にまとめて当てている(画面外の描画をスキップする)。
 *
 * 目次は sm+ では常時表示のsticky sidebar。スマホ(主要な利用シーン)では
 * 常時表示の余白が無いため、固定トリガーボタン+ドロワーで代替する
 * (どちらもスクロール位置によらず常に開けるという意味で「sticky」の
 * 意図を満たす)。
 */
export default function ReportDetailPage() {
    const params = useParams<{ slug: string }>()
    const slug = params.slug
    const supabase = useMemo(() => createClient(), [])
    const [report, setReport] = useState<ReportDetail | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [notFound, setNotFound] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [isTocOpen, setIsTocOpen] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const tocTriggerRef = useRef<HTMLButtonElement>(null)
    const tickingRef = useRef(false)
    const restoredRef = useRef(false)

    useEffect(() => {
        let cancelled = false
        setIsLoading(true)
        setNotFound(false)
        setErrorMessage(null)
        setIsTocOpen(false)
        restoredRef.current = false

        void (async () => {
            const { data, error } = await getReportBySlug(supabase, slug)
            if (cancelled) return
            if (error) {
                setErrorMessage('レポートの読み込みに失敗しました。')
                setIsLoading(false)
                return
            }
            if (!data) {
                setNotFound(true)
                setIsLoading(false)
                return
            }
            setReport({
                slug: data.slug,
                title: data.title,
                bodyHtml: data.body_html,
                toc: tocForDisplay(parseToc(data.toc)),
            })
            setIsLoading(false)
        })()

        return () => {
            cancelled = true
        }
    }, [supabase, slug])

    // 「続きから」: 読み込み後に保存済みスクロール位置へ復元する。
    // content-visibility:autoの子要素は実測高さの確定が遅れるため、
    // レイアウトが落ち着くのを2フレーム待ってから復元する
    // (プログラムによるscrollTop代入はcontent-visibilityの自動unskip対象
    // ではないため、完全ではない可能性がある。実機での確認が必要)。
    useEffect(() => {
        if (!report || restoredRef.current) return
        restoredRef.current = true
        const container = scrollContainerRef.current
        if (!container) return
        const saved = window.localStorage.getItem(scrollStorageKey(report.slug))
        if (!saved) return
        const value = Number(saved)
        if (!Number.isFinite(value) || value <= 0) return
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                container.scrollTop = value
            })
        })
    }, [report])

    const handleScroll = useCallback(() => {
        if (!report) return
        if (tickingRef.current) return
        tickingRef.current = true
        requestAnimationFrame(() => {
            const container = scrollContainerRef.current
            if (container) {
                window.localStorage.setItem(scrollStorageKey(report.slug), String(container.scrollTop))
            }
            tickingRef.current = false
        })
    }, [report])

    const closeToc = useCallback(() => {
        setIsTocOpen(false)
        // 閉じたあとキーボード操作がドロワーの裏に取り残されないよう、
        // フォーカスをトリガーボタンへ戻す。
        tocTriggerRef.current?.focus()
    }, [])

    useEffect(() => {
        if (!isTocOpen) return
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') closeToc()
        }
        window.addEventListener('keydown', handleKeyDown)

        return () => {
            document.body.style.overflow = prev
            window.removeEventListener('keydown', handleKeyDown)
        }
    }, [isTocOpen, closeToc])

    return (
        <div className="flex flex-col h-screen bg-neutral-100 dark:bg-neutral-950">
            <PageHeader title={report?.title ?? 'Report'}>
                <Link
                    href="/reports"
                    className="inline-flex h-9 items-center gap-2 rounded-sm border-2 border-neutral-600 bg-neutral-50 px-2 text-sm font-medium text-neutral-900 transition-colors duration-150 ease-in-out hover:border-neutral-700 hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-500 dark:border-neutral-500 dark:bg-neutral-900 dark:text-neutral-50 dark:hover:border-neutral-400 dark:hover:bg-neutral-800 dark:focus-visible:ring-neutral-500"
                >
                    <ArrowLeft className="w-4 h-4" />
                    一覧
                </Link>
            </PageHeader>

            <div className="flex-1 overflow-hidden relative">
                {isLoading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-100/80 dark:bg-neutral-950/80">
                        <div className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800 rounded p-4">
                            <LoadingIndicator />
                            <span className="text-sm text-neutral-700 dark:text-neutral-300">読み込み中…</span>
                        </div>
                    </div>
                )}

                {!isLoading && notFound && (
                    <div className="h-full overflow-y-auto px-2 sm:px-6 py-1 sm:py-4">
                        <section className="rounded bg-neutral-50 dark:bg-neutral-900 overflow-hidden border border-neutral-400 dark:border-neutral-600">
                            <div className="p-1 sm:p-4">
                                <p className="text-sm leading-6 sm:text-base sm:leading-7 text-neutral-900 dark:text-neutral-100">
                                    レポートが見つかりません。
                                </p>
                            </div>
                        </section>
                    </div>
                )}

                {!isLoading && errorMessage && (
                    <div className="h-full overflow-y-auto px-2 sm:px-6 py-1 sm:py-4">
                        <section className="rounded bg-neutral-50 dark:bg-neutral-900 overflow-hidden border border-neutral-400 dark:border-neutral-600">
                            <div className="p-1 sm:p-4">
                                <p className="text-sm leading-6 sm:text-base sm:leading-7 text-amber-600 dark:text-amber-400">
                                    {errorMessage}
                                </p>
                            </div>
                        </section>
                    </div>
                )}

                {!isLoading && report && (
                    <>
                        <div
                            ref={scrollContainerRef}
                            onScroll={handleScroll}
                            className="h-full overflow-y-auto px-2 sm:px-6 py-1 sm:py-4"
                        >
                            <div className="sm:flex sm:items-start sm:gap-6">
                                {report.toc.length > 0 && (
                                    <nav
                                        aria-label="目次"
                                        className="hidden sm:block sm:sticky sm:top-1 sm:w-56 sm:shrink-0 sm:max-h-screen sm:overflow-y-auto rounded bg-neutral-50 dark:bg-neutral-900 overflow-hidden border border-neutral-400 dark:border-neutral-600"
                                    >
                                        <header className="px-2 sm:px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50 text-sm leading-6 text-neutral-700 dark:text-neutral-300">
                                            目次
                                        </header>
                                        <div className="p-1 sm:p-2">
                                            <ReportToc toc={report.toc} />
                                        </div>
                                    </nav>
                                )}

                                <article
                                    className="report-body min-w-0 flex-1 rounded bg-neutral-50 dark:bg-neutral-900 overflow-hidden border border-neutral-400 dark:border-neutral-600 p-1 sm:p-4 pb-12 sm:pb-4"
                                    dangerouslySetInnerHTML={{ __html: report.bodyHtml }}
                                />
                            </div>
                        </div>

                        {/* スマホ: sm+のsticky sidebarが無いぶん、固定トリガー+ドロワーで
                            「目次はどのスクロール位置からでも開ける」を代替する。 */}
                        {report.toc.length > 0 && (
                            <button
                                ref={tocTriggerRef}
                                type="button"
                                onClick={() => setIsTocOpen(true)}
                                aria-expanded={isTocOpen}
                                aria-label="目次を開く"
                                className="sm:hidden fixed bottom-4 right-4 z-10 flex items-center justify-center w-12 h-12 rounded-sm border-2 border-neutral-400 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-50 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors duration-150 ease-in-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-600"
                            >
                                <List className="w-6 h-6" />
                            </button>
                        )}

                        {isTocOpen && (
                            <div
                                className="sm:hidden fixed inset-0 z-20 bg-neutral-950 opacity-50 dark:opacity-75"
                                aria-hidden
                                onClick={closeToc}
                            />
                        )}

                        {report.toc.length > 0 && (
                            <div
                                // 閉じている間はDOM上に残っていてもキーボード操作の対象に
                                // ならないようinertにする(aria-hidden+pointer-events-noneだけだと
                                // Tabで裏の非表示リンクへフォーカスが入ってしまうため)。
                                inert={!isTocOpen}
                                className={`sm:hidden fixed inset-y-0 right-0 z-30 w-64 flex flex-col border-l border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 transition-transform duration-150 ease-in-out ${
                                    isTocOpen ? 'translate-x-0' : 'translate-x-full'
                                }`}
                                role="dialog"
                                aria-modal="true"
                                aria-label="目次"
                                aria-hidden={!isTocOpen}
                            >
                                <div className="flex items-center justify-between px-2 sm:px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50">
                                    <span className="text-sm leading-6 text-neutral-700 dark:text-neutral-300">
                                        目次
                                    </span>
                                    <button
                                        type="button"
                                        onClick={closeToc}
                                        aria-label="目次を閉じる"
                                        className="flex items-center justify-center w-8 h-8 rounded-sm text-neutral-700 transition-colors duration-150 ease-in-out hover:bg-neutral-200 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-50 dark:focus-visible:ring-neutral-600"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto p-1 sm:p-2">
                                    <ReportToc toc={report.toc} onNavigate={closeToc} />
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
