'use client'

import { format, parseISO } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { Button } from '@/src/components/ui/Button'
import type { DrainAskRow } from '@/src/lib/supabase/queries/drain-asks'

type DrainAskListProps = {
    asks: DrainAskRow[]
    timezone: string
    resolvingId: string | null
    onResolve: (id: string) => void
}

// 無人実行が本人に頼む「手を動かさないと片づかないこと」。run のカードは毎時増えて48件で消えるので、
// 依頼はその上に別枠で置き、本人が「済」にするまで残す(drain_asks のマイグレーション冒頭)。
// 注意の色(amber)は「本人が待たれている」ものにだけ使う。0件なら枠ごと出さない。
export function DrainAskList({ asks, timezone, resolvingId, onResolve }: DrainAskListProps) {
    if (asks.length === 0) return null

    return (
        <section className="rounded border-2 border-amber-600 bg-neutral-50 dark:border-amber-400 dark:bg-neutral-900 overflow-hidden">
            <h2 className="px-2 py-2 sm:px-4 text-sm font-medium leading-6 text-amber-600 dark:text-amber-400">
                あなたへの依頼 {asks.length}件
            </h2>
            <ul className="flex flex-col">
                {asks.map((ask) => (
                    <li
                        key={ask.id}
                        className="flex flex-col gap-2 border-t border-neutral-200 p-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:p-4 dark:border-neutral-800"
                    >
                        <div className="flex min-w-0 flex-col gap-1 text-neutral-900 dark:text-neutral-100">
                            <p className="font-medium">{ask.title}</p>
                            {ask.detail && (
                                <p className="whitespace-pre-wrap break-words text-sm">{ask.detail}</p>
                            )}
                            <p className="text-sm text-neutral-700 dark:text-neutral-300">
                                {[
                                    format(toZonedTime(parseISO(ask.created_at), timezone), 'MM/dd HH:mm'),
                                    ask.source,
                                ]
                                    .filter(Boolean)
                                    .join(' / ')}
                            </p>
                        </div>
                        <Button
                            color="secondary"
                            className="shrink-0 self-end sm:self-start"
                            disabled={resolvingId === ask.id}
                            onClick={() => onResolve(ask.id)}
                        >
                            済
                        </Button>
                    </li>
                ))}
            </ul>
        </section>
    )
}
