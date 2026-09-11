'use client'

import { format, parseISO } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useId, useState } from 'react'
import { DrainRunCard } from '@/src/components/drain/DrainRunCard'
import { Button } from '@/src/components/ui/Button'
import type { DrainRunListRow } from '@/src/lib/supabase/queries/drain-runs'

type DrainRunGroupCardProps = {
    runs: DrainRunListRow[]
    timezone: string
    onLoadReport: (startedAt: string) => Promise<string | null>
}

// groupDrainRuns が畳んだ「起動なし」の連続回を1枚の要約カードで出す。中身は個別の
// DrainRunCard をそのまま展開するだけで、板の描画ロジックを二重に持たない
// (2026-09-11追加)。
export function DrainRunGroupCard({ runs, timezone, onLoadReport }: DrainRunGroupCardProps) {
    const [isOpen, setIsOpen] = useState(false)
    const panelId = useId()

    const oldest = runs[runs.length - 1]
    const newest = runs[0]
    const rangeLabel = [oldest, newest]
        .map((run) => format(toZonedTime(parseISO(run.started_at), timezone), 'MM/dd HH:mm'))
        .join('〜')

    return (
        <div className="rounded border border-neutral-400 bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-900 overflow-hidden">
            <Button
                color="ghost"
                size="nav"
                onClick={() => setIsOpen((prev) => !prev)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className="justify-start leading-6 rounded-none text-neutral-900 dark:text-neutral-50"
            >
                <span className="flex w-full min-w-0 items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 tabular-nums">{rangeLabel}</span>
                        <span className="shrink-0 px-1 py-0.5 rounded-sm border border-neutral-400 text-neutral-700 text-sm font-medium leading-none dark:border-neutral-600 dark:text-neutral-300">
                            起動なし ×{runs.length}
                        </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                        {isOpen ? (
                            <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
                        ) : (
                            <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                        )}
                    </span>
                </span>
            </Button>

            {isOpen && (
                <div
                    id={panelId}
                    className="flex flex-col gap-2 border-t border-neutral-200 p-1 sm:p-2 dark:border-neutral-800"
                >
                    {runs.map((run) => (
                        <DrainRunCard
                            key={run.started_at}
                            run={run}
                            timezone={timezone}
                            onLoadReport={onLoadReport}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}
