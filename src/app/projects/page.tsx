'use client'

import { format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { PageHeader } from '@/src/components/layout/PageHeader'
import { ProjectSection } from '@/src/components/projects/ProjectSection'
import { LoadingIndicator } from '@/src/components/ui/LoadingIndicator'
import { Button } from '@/src/components/ui/Button'
import { ProjectNoteForm } from '@/src/components/projects/ProjectNoteForm'
import { getDefaultTimezone } from '@/src/lib/date'
import { createClient } from '@/src/lib/supabase/client'
import { getGoals, type GoalRow } from '@/src/lib/supabase/queries/goals'
import { getProjectCards, type ProjectCardRow } from '@/src/lib/supabase/queries/project-cards'
import {
    getProjectNotes,
    latestNoteByCard,
    type ProjectNoteRow,
} from '@/src/lib/supabase/queries/project-notes'

export default function ProjectsPage() {
    const supabase = useMemo(() => createClient(), [])
    const timezone = useMemo(() => getDefaultTimezone(), [])
    const [goals, setGoals] = useState<GoalRow[]>([])
    const [projectCards, setProjectCards] = useState<ProjectCardRow[]>([])
    const [projectNotes, setProjectNotes] = useState<ProjectNoteRow[]>([])
    const [todayStr, setTodayStr] = useState<string | null>(null)
    const [isInitialLoading, setIsInitialLoading] = useState(true)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [showDormant, setShowDormant] = useState(false)
    const [isBoardNoteOpen, setIsBoardNoteOpen] = useState(false)
    const boardNotePanelId = useId()

    const loadProjectData = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
        if (mode === 'refresh') {
            setIsRefreshing(true)
        } else {
            setIsInitialLoading(true)
        }

        const [
            { data: cards, error: cardsError },
            { data: notes, error: notesError },
            { data: loadedGoals, error: goalsError },
        ] = await Promise.all([
            getProjectCards(supabase),
            getProjectNotes(supabase),
            getGoals(supabase),
        ])

        if (cardsError || notesError || goalsError) {
            setErrorMessage('プロジェクトカードの読み込みに失敗しました。')
            setIsInitialLoading(false)
            setIsRefreshing(false)
            return
        }

        setProjectCards(cards ?? [])
        setProjectNotes(notes ?? [])
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

    const notesByCard = useMemo(() => latestNoteByCard(projectNotes), [projectNotes])

    function handleNoteSaved(row: ProjectNoteRow) {
        setProjectNotes((prev) => [row, ...prev])
    }

    const visibleCards = projectCards.filter(
        (card) =>
            card.status === 'active' ||
            card.status === 'waiting_user' ||
            card.status === 'waiting_other'
    )
    const cardsByGoal = new Map<string, ProjectCardRow[]>()
    for (const goal of goals) {
        cardsByGoal.set(goal.slug, [])
    }
    const unclassifiedCards: ProjectCardRow[] = []
    for (const card of visibleCards) {
        const goalCards = card.goal_slug ? cardsByGoal.get(card.goal_slug) : undefined
        if (goalCards) {
            goalCards.push(card)
        } else {
            unclassifiedCards.push(card)
        }
    }
    // done は getProjectCards の取得段階で除外済み（アクセス経路自体をなくす対象。
    // 2026-08-10・本人指示）。ここで扱うのは dormant の畳みだけ。
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
                                <p className="text-sm leading-6 sm:text-base sm:leading-7 text-neutral-900 dark:text-neutral-100">
                                    表示できるプロジェクトカードはありません。
                                </p>
                            </div>
                        </section>
                    )}

                    {/* 目標見出しはカードが1枚も無くても出す（5つの目標は固定の枠であって、
                        カードの有無で消える面ではない）。 */}
                    {!isInitialLoading && todayStr !== null && (
                        <>
                            {unclassifiedCards.length > 0 && (
                                <ProjectSection
                                    title="未分類"
                                    description="目標が未設定です。撤退候補か、目標定義の宿題です。"
                                    cards={unclassifiedCards}
                                    today={todayStr}
                                    notesByCard={notesByCard}
                                    onNoteSaved={handleNoteSaved}
                                    tone="warning"
                                />
                            )}
                            {goals.map((goal) => (
                                <ProjectSection
                                    key={goal.slug}
                                    title={goal.title}
                                    cards={cardsByGoal.get(goal.slug) ?? []}
                                    today={todayStr}
                                    notesByCard={notesByCard}
                                    onNoteSaved={handleNoteSaved}
                                    showWhenEmpty
                                />
                            ))}

                            {dormantCards.length > 0 && (
                                <section className="space-y-2 sm:space-y-4">
                                    <Button
                                        color="surface"
                                        size="bar"
                                        onClick={() => setShowDormant((prev) => !prev)}
                                        aria-expanded={showDormant}
                                        className="leading-6"
                                    >
                                        休止中{dormantCards.length}件
                                    </Button>
                                    {showDormant && (
                                        <ProjectSection
                                            title="休止中"
                                            cards={dormantCards}
                                            today={todayStr}
                                            notesByCard={notesByCard}
                                            onNoteSaved={handleNoteSaved}
                                        />
                                    )}
                                </section>
                            )}
                        </>
                    )}

                    {/* 板全体への記述欄。個別カードに属さない指示をここで受ける
                        （新規プロジェクトの追加・クローズ・横断の方針など）。 */}
                    {!isInitialLoading && (
                        <div className="flex flex-col gap-2">
                            <Button
                                color="surface"
                                size="bar"
                                onClick={() => setIsBoardNoteOpen((prev) => !prev)}
                                aria-expanded={isBoardNoteOpen}
                                aria-controls={boardNotePanelId}
                                className="leading-6"
                            >
                                <span className="flex w-full min-w-0 items-center justify-between gap-2">
                                    <span className="min-w-0 truncate">板全体について</span>
                                    {isBoardNoteOpen ? (
                                        <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
                                    ) : (
                                        <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                                    )}
                                </span>
                            </Button>
                            {isBoardNoteOpen && (
                                <div
                                    id={boardNotePanelId}
                                    className="rounded border-2 border-neutral-400 bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-900 overflow-hidden"
                                >
                                    <div className="p-1 sm:p-4">
                                        <ProjectNoteForm
                                            cardSlug={null}
                                            label="板全体について"
                                            placeholder="プロジェクトの追加・クローズ・横断の方針など、特定のカードに属さないこと"
                                            latestNote={notesByCard.get(null) ?? null}
                                            onSaved={handleNoteSaved}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
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
