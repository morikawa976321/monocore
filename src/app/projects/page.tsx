'use client'

import { format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader } from '@/src/components/layout/PageHeader'
import { ProjectSection } from '@/src/components/projects/ProjectSection'
import { LoadingIndicator } from '@/src/components/ui/LoadingIndicator'
import { getDefaultTimezone } from '@/src/lib/date'
import { createClient } from '@/src/lib/supabase/client'
import { getGoals, type GoalRow } from '@/src/lib/supabase/queries/goals'
import { getProjectCards, type ProjectCardRow } from '@/src/lib/supabase/queries/project-cards'

export default function ProjectsPage() {
    const supabase = useMemo(() => createClient(), [])
    const timezone = useMemo(() => getDefaultTimezone(), [])
    const [goals, setGoals] = useState<GoalRow[]>([])
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

        const [{ data: cards, error: cardsError }, { data: loadedGoals, error: goalsError }] =
            await Promise.all([getProjectCards(supabase), getGoals(supabase)])

        if (cardsError || goalsError) {
            setErrorMessage('プロジェクトカードの読み込みに失敗しました。')
            setIsInitialLoading(false)
            setIsRefreshing(false)
            return
        }

        setProjectCards(cards ?? [])
        setGoals(loadedGoals ?? [])
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

    // waiting は「トリガー待ち」の1状態。誰が待たれているかで分けていた
    // waiting_user / waiting_other は2026-08-11に統合した（実質のボトルネックは
    // 常に本人なので、区別しても行動が変わらない）。
    const visibleCards = projectCards.filter(
        (card) => card.status === 'active' || card.status === 'waiting'
    )
    // 生存中(active/waiting)のカードは必ずいずれかの目標に属する前提（2026-08-14決定）。
    // 「未分類」でのはみ出し表示は撤去済み — この機構は本人が依頼していないカードを
    // 可視化しただけで終わった（新規カード作成を本人の明示的指示に限定したため、
    // 目標未定のカードが生まれる経路自体を塞いだ）。
    const cardsByGoal = new Map<string, ProjectCardRow[]>()
    for (const goal of goals) {
        cardsByGoal.set(goal.slug, [])
    }
    for (const card of visibleCards) {
        const goalCards = card.goal_slug ? cardsByGoal.get(card.goal_slug) : undefined
        goalCards?.push(card)
    }
    // done は getProjectCards の取得段階で除外済み（アクセス経路自体をなくす対象。
    // 2026-08-10・本人指示）。dormant は目標セクションと同じ見出しで常時表示する。
    const dormantCards = projectCards.filter((card) => card.status === 'dormant')
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

                    {/* 目標見出しはカードが1枚も無くても出す（5つの目標は固定の枠であって、
                        カードの有無で消える面ではない）。 */}
                    {!isInitialLoading && todayStr !== null && (
                        <>
                            {goals.map((goal) => (
                                <ProjectSection
                                    key={goal.slug}
                                    title={goal.title}
                                    cards={cardsByGoal.get(goal.slug) ?? []}
                                    today={todayStr}
                                    showWhenEmpty
                                />
                            ))}

                            <ProjectSection title="休止中" cards={dormantCards} today={todayStr} />
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
