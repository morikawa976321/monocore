'use client'

import { format, parseISO } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '@/src/components/ui/Button'
import { LoadingIndicator } from '@/src/components/ui/LoadingIndicator'
import {
    formatDuration,
    parseRunSteps,
    parseRunTasks,
    parseTriggerReasons,
    type RunStepStatus,
} from '@/src/lib/drain/run'
import type { DrainRunListRow } from '@/src/lib/supabase/queries/drain-runs'

type DrainRunCardProps = {
    run: DrainRunListRow
    timezone: string
    onLoadReport: (startedAt: string) => Promise<string | null>
}

// 成功に色を使わない（README-design.md: 使ってよいのは neutral / amber / red / transparent）。
// 目立たせるのは注意と失敗だけで、平常運転は地の色で流す。
const STATUS_CLASS_NAMES: Record<RunStepStatus, string> = {
    ok: 'text-neutral-700 dark:text-neutral-300',
    warn: 'text-amber-600 dark:text-amber-400',
    error: 'text-red-700 dark:text-red-500',
}

const OUTCOME_LABELS: Record<string, string> = {
    completed: '完了',
    crashed: '異常終了',
    skipped: '起動なし',
}

// outcome は 'completed' / 'crashed' / 'skipped' しか取れない（drain_runs の CHECK 制約）。
// 「完了はしたが queue に残件がある」のような注意は outcome では表せないので、
// steps[].status を巻き上げてバッジの色に載せる。畳んだ状態で steps は描画されないため、
// ここで巻き上げないと注意・異常が展開するまで一切見えない。
function outcomeClassName(outcome: string, worstStep: RunStepStatus): string {
    if (outcome === 'crashed' || worstStep === 'error') {
        return 'border-red-700 text-red-700 dark:border-red-600 dark:text-red-500'
    }
    if (worstStep === 'warn') {
        return 'border-amber-600 text-amber-600 dark:border-amber-400 dark:text-amber-400'
    }
    return 'border-neutral-400 text-neutral-700 dark:border-neutral-600 dark:text-neutral-300'
}

export function DrainRunCard({ run, timezone, onLoadReport }: DrainRunCardProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [reportText, setReportText] = useState<string | null>(null)
    const [isReportLoading, setIsReportLoading] = useState(false)
    const [isReportOpen, setIsReportOpen] = useState(false)
    const panelId = useId()

    const steps = parseRunSteps(run.steps)
    const tasks = parseRunTasks(run.tasks)
    const reasons = parseTriggerReasons(run.trigger_reasons)
    const duration = formatDuration(run.started_at, run.ended_at)
    const startedLabel = format(toZonedTime(parseISO(run.started_at), timezone), 'MM/dd HH:mm')

    const doneCount = tasks.filter((task) => task.outcome === 'done').length
    const failedCount = tasks.filter((task) => task.outcome === 'failed').length
    const warnCount = steps.filter((step) => step.status === 'warn').length
    const errorCount = steps.filter((step) => step.status === 'error').length
    const worstStep: RunStepStatus = errorCount > 0 ? 'error' : warnCount > 0 ? 'warn' : 'ok'

    async function handleToggleReport() {
        if (isReportOpen) {
            setIsReportOpen(false)
            return
        }
        setIsReportOpen(true)
        if (reportText !== null || isReportLoading) return
        setIsReportLoading(true)
        setReportText(await onLoadReport(run.started_at))
        setIsReportLoading(false)
    }

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
                        <span className="shrink-0 tabular-nums">{startedLabel}</span>
                        <span
                            className={`shrink-0 px-1 py-0.5 rounded-sm border text-sm font-medium leading-none ${outcomeClassName(run.outcome, worstStep)}`}
                        >
                            {OUTCOME_LABELS[run.outcome] ?? run.outcome}
                        </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                        {(errorCount > 0 || warnCount > 0) && (
                            <span
                                className={
                                    errorCount > 0
                                        ? STATUS_CLASS_NAMES.error
                                        : STATUS_CLASS_NAMES.warn
                                }
                            >
                                {[
                                    errorCount > 0 && `異常${errorCount}件`,
                                    warnCount > 0 && `注意${warnCount}件`,
                                ]
                                    .filter(Boolean)
                                    .join(' / ')}
                            </span>
                        )}
                        {tasks.length > 0 && (
                            <span className={failedCount > 0 ? STATUS_CLASS_NAMES.error : undefined}>
                                タスク{doneCount}件
                                {failedCount > 0 && ` / 失敗${failedCount}件`}
                            </span>
                        )}
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
                    className="flex flex-col gap-4 border-t border-neutral-200 p-1 sm:p-4 text-neutral-900 dark:border-neutral-800 dark:text-neutral-100"
                >
                    <p className="text-sm text-neutral-700 dark:text-neutral-300">
                        {[
                            run.model,
                            run.effort,
                            duration,
                            run.exit_code === null ? null : `exit=${run.exit_code}`,
                        ]
                            .filter(Boolean)
                            .join(' / ')}
                    </p>

                    {reasons.length > 0 && (
                        <section className="flex flex-col gap-2">
                            <h4 className="text-sm font-medium leading-6 text-neutral-700 dark:text-neutral-300">
                                起動理由
                            </h4>
                            <p>{reasons.join(' / ')}</p>
                        </section>
                    )}

                    {steps.length > 0 && (
                        <section className="flex flex-col gap-2">
                            <h4 className="text-sm font-medium leading-6 text-neutral-700 dark:text-neutral-300">
                                何をして / どうなったか
                            </h4>
                            <ul className="flex flex-col gap-1">
                                {steps.map((step, index) => (
                                    <li
                                        key={`${run.started_at}-step-${index}`}
                                        className="flex flex-col gap-0.5 sm:flex-row sm:gap-2"
                                    >
                                        <span className="shrink-0 font-medium sm:w-48">
                                            {step.did}
                                        </span>
                                        <span className={STATUS_CLASS_NAMES[step.status]}>
                                            {step.result}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    {tasks.map((task) => (
                        <section key={task.taskId} className="flex flex-col gap-2">
                            <h4 className="text-sm font-medium leading-6 text-neutral-700 dark:text-neutral-300">
                                {task.title || task.taskId}
                                <span
                                    className={`ml-2 ${task.outcome === 'failed' ? STATUS_CLASS_NAMES.error : ''}`}
                                >
                                    {task.outcome ?? '不明'}
                                    {task.gatePassed === false && '（ゲート不通過）'}
                                </span>
                            </h4>
                            {/* 1タスク＝1要約（何のために何をして、どうなったか）。工程を
                                並べるのは summary が無い古い行だけで、そちらは代替経路。 */}
                            {task.summary.length > 0 ? (
                                <p className="whitespace-pre-line text-neutral-700 dark:text-neutral-300">
                                    {task.summary}
                                </p>
                            ) : (
                                <ul className="flex flex-col gap-1">
                                    {task.steps.map((step, index) => (
                                        <li
                                            key={`${task.taskId}-step-${index}`}
                                            className="flex flex-col gap-0.5 sm:flex-row sm:gap-2"
                                        >
                                            <span
                                                className={`shrink-0 sm:w-48 ${step.status === 'failed' ? STATUS_CLASS_NAMES.error : ''}`}
                                            >
                                                {step.desc}
                                            </span>
                                            <span className="text-neutral-700 dark:text-neutral-300">
                                                {step.note}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {task.delegation.length > 0 && (
                                <p className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                                    <span className="shrink-0 sm:w-48">委譲</span>
                                    <span className="text-neutral-700 dark:text-neutral-300">
                                        {task.delegation
                                            .map(
                                                (entry) =>
                                                    `${entry.target} ${entry.calls ?? '?'}回 ${entry.outcome}`
                                            )
                                            .join(' / ')}
                                        {task.qaRounds !== null && ` ／ QA ${task.qaRounds}往復`}
                                    </span>
                                </p>
                            )}

                            {task.failures.length > 0 && (
                                <ul className="flex flex-col gap-1">
                                    {task.failures.map((failure, index) => (
                                        <li
                                            key={`${task.taskId}-failure-${index}`}
                                            className="flex flex-col gap-0.5 sm:flex-row sm:gap-2"
                                        >
                                            <span className="shrink-0 sm:w-48 text-amber-600 dark:text-amber-400">
                                                つまずき（{failure.phase}）
                                            </span>
                                            <span className="text-neutral-700 dark:text-neutral-300">
                                                {failure.symptom} → {failure.resolution}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}

                            {/* 想定外に発生・発見したこと。本人が板に求める4点の最後の1つで、
                                失敗とは限らないが「聞きに来る手がかり」なので注意色で出す。 */}
                            {task.notes.length > 0 && (
                                <p className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                                    <span className="shrink-0 sm:w-48 text-amber-600 dark:text-amber-400">
                                        想定外
                                    </span>
                                    <span className="whitespace-pre-line text-neutral-700 dark:text-neutral-300">
                                        {task.notes}
                                    </span>
                                </p>
                            )}
                        </section>
                    ))}

                    <section className="flex flex-col gap-2">
                        <Button
                            color="link"
                            size="link"
                            onClick={() => void handleToggleReport()}
                            aria-expanded={isReportOpen}
                            className="self-start"
                        >
                            {isReportOpen ? '報告の全文を閉じる' : '報告の全文'}
                        </Button>
                        {isReportOpen && isReportLoading && <LoadingIndicator />}
                        {isReportOpen && !isReportLoading && (
                            <pre className="overflow-x-auto whitespace-pre-wrap break-words text-sm text-neutral-700 dark:text-neutral-300">
                                {reportText ?? '報告の全文は記録されていません。'}
                            </pre>
                        )}
                    </section>
                </div>
            )}
        </div>
    )
}
