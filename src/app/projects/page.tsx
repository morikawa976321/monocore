'use client'

import { format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader } from '@/src/components/layout/PageHeader'
import { ProjectSection } from '@/src/components/projects/ProjectSection'
import { LoadingIndicator } from '@/src/components/ui/LoadingIndicator'
import { getDefaultTimezone } from '@/src/lib/date'
import { latestAnswerByDecision } from '@/src/lib/projects/answers'
import { createClient } from '@/src/lib/supabase/client'
import { getProjectCards, type ProjectCardRow } from '@/src/lib/supabase/queries/project-cards'
import {
    getDecisionAnswers,
    type DecisionAnswerRow,
} from '@/src/lib/supabase/queries/project-card-answers'

export default function ProjectsPage() {
    const supabase = useMemo(() => createClient(), [])
    const timezone = useMemo(() => getDefaultTimezone(), [])
    const [projectCards, setProjectCards] = useState<ProjectCardRow[]>([])
    const [decisionAnswers, setDecisionAnswers] = useState<DecisionAnswerRow[]>([])
    const [todayStr, setTodayStr] = useState<string | null>(null)
    const [isInitialLoading, setIsInitialLoading] = useState(true)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [showDormant, setShowDormant] = useState(false)

    const loadProjectData = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
        if (mode === 'refresh') {
            setIsRefreshing(true)
        } else {
            setIsInitialLoading(true)
        }

        const [{ data: cards, error: cardsError }, { data: answers, error: answersError }] =
            await Promise.all([
                getProjectCards(supabase),
                getDecisionAnswers(supabase),
            ])

        if (cardsError || answersError) {
            setErrorMessage('プロジェクトカードの読み込みに失敗しました。')
            setIsInitialLoading(false)
            setIsRefreshing(false)
            return
        }

        setProjectCards(cards ?? [])
        setDecisionAnswers(answers ?? [])
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

    const answersByDecision = useMemo(() => latestAnswerByDecision(decisionAnswers), [decisionAnswers])

    function handleAnswered(row: DecisionAnswerRow) {
        setDecisionAnswers((prev) => [row, ...prev])
    }

    const activeCards = projectCards.filter((card) => card.status === 'active')
    const waitingUserCards = projectCards.filter((card) => card.status === 'waiting_user')
    const waitingOtherCards = projectCards.filter((card) => card.status === 'waiting_other')
    const dormantCards = projectCards.filter((card) => card.status === 'dormant')
    const doneCards = projectCards.filter((card) => card.status === 'done')
    // 「寝ている」と「完了」は畳む点は同じだが意味が違うので件数を分けて出す。
    const collapsedCount = dormantCards.length + doneCards.length
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
                                <p className="text-sm leading-6 sm:text-base sm:leading-7 text-neutral-900 dark:text-neutral-100">
                                    表示できるプロジェクトカードはありません。
                                </p>
                            </div>
                        </section>
                    )}

                    {!isInitialLoading && todayStr !== null && projectCards.length > 0 && (
                        <>
                            <ProjectSection
                                title="動いている"
                                cards={activeCards}
                                today={todayStr}
                                answers={answersByDecision}
                                onAnswered={handleAnswered}
                            />
                            <ProjectSection
                                title="あなた待ち"
                                cards={waitingUserCards}
                                today={todayStr}
                                answers={answersByDecision}
                                onAnswered={handleAnswered}
                            />
                            <ProjectSection
                                title="他人待ち"
                                cards={waitingOtherCards}
                                today={todayStr}
                                answers={answersByDecision}
                                onAnswered={handleAnswered}
                            />

                            {collapsedCount > 0 && (
                                <section className="space-y-2 sm:space-y-4">
                                    <button
                                        type="button"
                                        onClick={() => setShowDormant((prev) => !prev)}
                                        aria-expanded={showDormant}
                                        className="w-full rounded border border-neutral-400 bg-neutral-50 px-2 sm:px-4 py-2 text-left text-sm leading-6 font-medium text-neutral-700 transition-colors duration-150 ease-in-out hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:focus-visible:ring-neutral-400"
                                    >
                                        休止中{dormantCards.length}件・完了{doneCards.length}件
                                    </button>
                                    {showDormant && (
                                        <>
                                            <ProjectSection
                                                title="休止中"
                                                cards={dormantCards}
                                                today={todayStr}
                                                answers={answersByDecision}
                                                onAnswered={handleAnswered}
                                            />
                                            <ProjectSection
                                                title="完了"
                                                cards={doneCards}
                                                today={todayStr}
                                                answers={answersByDecision}
                                                onAnswered={handleAnswered}
                                            />
                                        </>
                                    )}
                                </section>
                            )}
                        </>
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
