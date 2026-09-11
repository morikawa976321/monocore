'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { DrainRunCard } from '@/src/components/drain/DrainRunCard'
import { DrainRunGroupCard } from '@/src/components/drain/DrainRunGroupCard'
import { PageHeader } from '@/src/components/layout/PageHeader'
import { LoadingIndicator } from '@/src/components/ui/LoadingIndicator'
import { getDefaultTimezone } from '@/src/lib/date'
import { groupDrainRuns } from '@/src/lib/drain/group-runs'
import { createClient } from '@/src/lib/supabase/client'
import {
    getDrainRunReport,
    getDrainRuns,
    type DrainRunListRow,
} from '@/src/lib/supabase/queries/drain-runs'

export default function DrainPage() {
    const supabase = useMemo(() => createClient(), [])
    const timezone = useMemo(() => getDefaultTimezone(), [])
    const [runs, setRuns] = useState<DrainRunListRow[]>([])
    const displayItems = useMemo(() => groupDrainRuns(runs), [runs])
    const [isInitialLoading, setIsInitialLoading] = useState(true)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    const loadRuns = useCallback(
        async (mode: 'initial' | 'refresh' = 'initial') => {
            if (mode === 'refresh') {
                setIsRefreshing(true)
            } else {
                setIsInitialLoading(true)
            }

            const { data, error } = await getDrainRuns(supabase)

            if (error) {
                setErrorMessage('実行記録の読み込みに失敗しました。')
            } else {
                setRuns(data ?? [])
                setErrorMessage(null)
            }
            setIsInitialLoading(false)
            setIsRefreshing(false)
        },
        [supabase]
    )

    useEffect(() => {
        void loadRuns('initial')
    }, [loadRuns])

    // 全文はカードを開いたときだけ取りに行く(一覧では列ごと落としてある)。
    const loadReport = useCallback(
        async (startedAt: string) => {
            const { data } = await getDrainRunReport(supabase, startedAt)
            return data
        },
        [supabase]
    )

    return (
        <div className="flex flex-col h-screen bg-neutral-100 dark:bg-neutral-950">
            <PageHeader
                title="Drain"
                onRefresh={() => void loadRuns('refresh')}
                isRefreshing={isRefreshing}
            >
                {errorMessage && (
                    <span className="text-sm text-amber-600 dark:text-amber-400">{errorMessage}</span>
                )}
            </PageHeader>

            <div className="flex-1 overflow-hidden relative">
                <div className="h-full overflow-y-auto px-2 sm:px-6 py-1 sm:py-4 space-y-2 sm:space-y-4">
                    {!isInitialLoading && runs.length === 0 && (
                        <section className="rounded bg-neutral-50 dark:bg-neutral-900 overflow-hidden border border-neutral-400 dark:border-neutral-600">
                            <div className="p-1 sm:p-4">
                                <p className="text-neutral-900 dark:text-neutral-100">
                                    表示できる実行記録はありません。
                                </p>
                            </div>
                        </section>
                    )}

                    {displayItems.map((item) =>
                        item.kind === 'run' ? (
                            <DrainRunCard
                                key={item.run.started_at}
                                run={item.run}
                                timezone={timezone}
                                onLoadReport={loadReport}
                            />
                        ) : (
                            <DrainRunGroupCard
                                key={item.runs[0].started_at}
                                runs={item.runs}
                                timezone={timezone}
                                onLoadReport={loadReport}
                            />
                        )
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
