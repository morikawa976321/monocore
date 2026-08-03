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
    const [isLoading, setIsLoading] = useState(true)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [showDormant, setShowDormant] = useState(false)

    const loadProjectCards = useCallback(async () => {
        setIsLoading(true)
        const { data, error } = await getProjectCards(supabase)
        if (error) {
            setErrorMessage('プロジェクトカードの読み込みに失敗しました。')
            setIsLoading(false)
            return
        }
        setProjectCards(data ?? [])
        setErrorMessage(null)
        setIsLoading(false)
    }, [supabase])

    useEffect(() => {
        setTodayStr(format(toZonedTime(new Date(), timezone), 'yyyy-MM-dd'))
    }, [timezone])

    useEffect(() => {
        void loadProjectCards()
    }, [loadProjectCards])

    const activeCards = projectCards.filter((card) => card.status === 'active')
    const waitingUserCards = projectCards.filter((card) => card.status === 'waiting_user')
    const waitingOtherCards = projectCards.filter((card) => card.status === 'waiting_other')
    const dormantCards = projectCards.filter((card) => card.status === 'dormant')

    return (
        <div className="flex h-screen flex-col bg-neutral-100 dark:bg-neutral-950">
            <PageHeader
                title="Projects"
                onRefresh={() => void loadProjectCards()}
                isRefreshing={isLoading}
            >
                {isLoading && (
                    <div className="inline-flex items-center gap-2">
                        <LoadingIndicator />
                        <span className="text-sm text-neutral-700 dark:text-neutral-300">読み込み中…</span>
                    </div>
                )}
                {errorMessage && (
                    <span className="text-sm text-amber-600 dark:text-amber-400">{errorMessage}</span>
                )}
            </PageHeader>

            <main className="flex-1 overflow-y-auto p-2 sm:p-6">
                {(isLoading || todayStr === null) && (
                    <div className="flex h-full items-center justify-center">
                        <LoadingIndicator size="md" />
                    </div>
                )}

                {!isLoading && todayStr !== null && projectCards.length === 0 && (
                    <div className="rounded border border-neutral-200 bg-neutral-50 p-6 dark:border-neutral-800 dark:bg-neutral-900">
                        <p className="text-sm text-neutral-800 dark:text-neutral-200">
                            表示できるプロジェクトカードはありません。
                        </p>
                    </div>
                )}

                {!isLoading && todayStr !== null && projectCards.length > 0 && (
                    <div className="flex flex-col gap-6">
                        <ProjectSection title="動いている" cards={activeCards} today={todayStr} />
                        <ProjectSection title="あなた待ち" cards={waitingUserCards} today={todayStr} />
                        <ProjectSection title="他人待ち" cards={waitingOtherCards} today={todayStr} />

                        {dormantCards.length > 0 && (
                            <section className="flex flex-col gap-4">
                                <button
                                    type="button"
                                    onClick={() => setShowDormant((prev) => !prev)}
                                    aria-expanded={showDormant}
                                    className="w-full rounded border border-neutral-200 bg-neutral-50 p-4 text-left text-sm font-medium text-neutral-900 transition-colors duration-150 ease-in-out hover:bg-neutral-200 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-50 dark:hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-500 dark:focus-visible:ring-neutral-500"
                                >
                                    他{dormantCards.length}件
                                </button>
                                {showDormant && (
                                    <ProjectSection title="休止中" cards={dormantCards} today={todayStr} />
                                )}
                            </section>
                        )}
                    </div>
                )}
            </main>
        </div>
    )
}
