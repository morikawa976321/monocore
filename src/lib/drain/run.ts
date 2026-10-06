import type { Json } from '@/src/types/database.types'

/**
 * drain_runs の JSONB 列（steps / tasks / trigger_reasons）を画面用の形へ読み解く。
 *
 * 投入側（taskbox/drain.ps1 → scripts/drain-run-payload.mjs）で検証済みだが、
 * 書き手がPowerShellで型を共有できないため、読む側でも壊れた形を落とす。
 * 落とすのは「その項目だけ」で、run全体を無かったことにはしない
 * （実行記録の面なので、一部が壊れていても残りは見えるほうが役に立つ）。
 */

export type RunStepStatus = 'ok' | 'warn' | 'error'

/** ラッパーが機械的に観測した工程1件。「何をして」「どうなったか」の組。 */
export type RunStep = {
    did: string
    result: string
    status: RunStepStatus
}

/**
 * タスクの中の工程1件（taskbox/traces/<task-id>.json の steps[] 由来）。
 * 2026-08-30以降、板の本文は summary 1文で、これは summary の無い古い行の代替。
 */
type TaskStep = {
    desc: string
    status: string
    note: string
}

type TaskFailure = {
    phase: string
    symptom: string
    resolution: string
}

/** 委譲先1件の成否。outcome は ok / quota(使用量制限) / error。 */
type TaskDelegation = {
    target: string
    calls: number | null
    outcome: string
}

export type RunTask = {
    taskId: string
    title: string
    outcome: string | null
    gatePassed: boolean | null
    targetDir: string | null
    /** 何のために何をして、どうなったか（1〜2文）。古い行は空で、そのときだけ steps を出す。 */
    summary: string
    steps: TaskStep[]
    failures: TaskFailure[]
    delegation: TaskDelegation[]
    qaRounds: number | null
    /** 想定外に発生・発見したこと（trace の notes）。無い回は空文字。 */
    notes: string
}

const STEP_STATUSES = new Set<RunStepStatus>(['ok', 'warn', 'error'])

function isRecord(value: Json | undefined): value is { [key: string]: Json | undefined } {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asArray(value: Json): Json[] {
    return Array.isArray(value) ? value : []
}

function asString(value: Json | undefined): string {
    return typeof value === 'string' ? value : ''
}

function asStringOrNull(value: Json | undefined): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null
}

export function parseTriggerReasons(value: Json): string[] {
    return asArray(value).filter(
        (reason): reason is string => typeof reason === 'string' && reason.trim().length > 0
    )
}

export function parseRunSteps(value: Json): RunStep[] {
    return asArray(value)
        .filter(isRecord)
        .map((step) => ({
            did: asString(step.did),
            result: asString(step.result),
            status: STEP_STATUSES.has(step.status as RunStepStatus)
                ? (step.status as RunStepStatus)
                : 'ok',
        }))
        .filter((step) => step.did.length > 0)
}

export function parseRunTasks(value: Json): RunTask[] {
    return asArray(value)
        .filter(isRecord)
        .map((task) => ({
            taskId: asString(task.task_id),
            title: asString(task.title),
            outcome: asStringOrNull(task.outcome),
            gatePassed: typeof task.gate_passed === 'boolean' ? task.gate_passed : null,
            targetDir: asStringOrNull(task.target_dir),
            summary: asString(task.summary),
            steps: asArray(task.steps ?? null)
                .filter(isRecord)
                .map((step) => ({
                    desc: asString(step.desc),
                    status: asString(step.status),
                    note: asString(step.note),
                }))
                .filter((step) => step.desc.length > 0),
            failures: asArray(task.failures ?? null)
                .filter(isRecord)
                .map((failure) => ({
                    phase: asString(failure.phase),
                    symptom: asString(failure.symptom),
                    resolution: asString(failure.resolution),
                }))
                .filter((failure) => failure.symptom.length > 0),
            delegation: asArray(task.delegation ?? null)
                .filter(isRecord)
                .map((entry) => ({
                    target: asString(entry.target),
                    calls: typeof entry.calls === 'number' ? entry.calls : null,
                    outcome: asString(entry.outcome),
                }))
                .filter((entry) => entry.target.length > 0),
            qaRounds: typeof task.qa_rounds === 'number' ? task.qa_rounds : null,
            notes: asString(task.notes),
        }))
        .filter((task) => task.taskId.length > 0)
}

/**
 * 枠の所要時間。ended_at が無い（＝終了行を書けずに死んだ）場合は null。
 * 「何分かかったか」は使用量制限で死んだ回を読むときの手がかりになる。
 */
export function formatDuration(startedAt: string, endedAt: string | null): string | null {
    if (endedAt === null) return null
    const durationMs = Date.parse(endedAt) - Date.parse(startedAt)
    if (Number.isNaN(durationMs) || durationMs < 0) return null

    const totalMinutes = Math.round(durationMs / 60000)
    if (totalMinutes < 60) return `${totalMinutes}分`
    return `${Math.floor(totalMinutes / 60)}時間${totalMinutes % 60}分`
}
