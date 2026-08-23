'use client'

import { format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader } from '@/src/components/layout/PageHeader'
import { ProjectSection } from '@/src/components/projects/ProjectSection'
import { LoadingIndicator } from '@/src/components/ui/LoadingIndicator'
import { getDefaultTimezone } from '@/src/lib/date'
import { createClient } from '@/src/lib/supabase/client'
import { getProjectCards, type ProjectCardRow } from '@/src/lib/supabase/queries/project-cards'

export default function ProjectsPage() {
    const supabase = useMemo(() => createClient(), [])
    const timezone = useMemo(() => getDefaultTimezone(), [])
    const [projectCards, setProjectCards] = useState<ProjectCardRow[]>([])
    const [todayStr, setTodayStr] = useState<string | null>(null)
    const [isInitialLoading, setIsInitialLoading] = useState(true)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    const loadProjectData = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
        if (mode === 'refresh') {
            setIsRefreshing(true)
        } else {
            setIsInitialLoading(true)
        }

        const { data: cards, error: cardsError } = await getProjectCards(supabase)

        if (cardsError) {
            setErrorMessage('プロジェクトカードの読み込みに失敗しました。')
            setIsInitialLoading(false)
            setIsRefreshing(false)
            return
        }

        setProjectCards(cards ?? [])
        setErrorMessage(null)
        setIsInitialLoading(false)
        setIsRefreshing(false)
    }, [supabase])

    useEffect(() => {
        setTodayStr(format(toZonedTime(new Date(), timezone), 'yyyy-MM-dd'))
    }, [timezone])

    useEffect(() => {
        void loadProjectData('initial')
    }, [loadProjectData])

    return (
        <div className="flex flex-col h-screen bg-neutral-100 dark:bg-neutral-950">
            <PageHeader
                title="Projects"
                onRefresh={() => void loadProjectData('refresh')}
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
                    {!isInitialLoading && todayStr !== null && projectCards.length === 0 && (
                        <section className="rounded bg-neutral-50 dark:bg-neutral-900 overflow-hidden border border-neutral-400 dark:border-neutral-600">
                            <div className="p-1 sm:p-4">
                                <p className="text-neutral-900 dark:text-neutral-100">
                                    表示できるプロジェクトカードはありません。
                                </p>
                            </div>
                        </section>
                    )}

                    {!isInitialLoading && todayStr !== null && (
                        <ProjectSection title="プロジェクト" cards={projectCards} today={todayStr} />
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
