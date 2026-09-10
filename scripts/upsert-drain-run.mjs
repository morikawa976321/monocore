/**
 * drain_runs への投入スクリプト（taskbox/drain.ps1 → public.drain_runs）。
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/upsert-drain-run.mjs <payload.json>
 *
 * 1回の呼び出しで1枠（1 run）だけを書く。キーは started_at で、同じ枠を
 * 二度投げても行は増えない（upsert）。upsert のあと、画面が一覧で取る件数
 * （DRAIN_RUNS_KEEP = src/lib/supabase/queries/drain-runs.ts の
 * DRAIN_RUNS_LIST_LIMIT）を超えた古い行を消す。articles の投入時削除と同じ経路。
 *
 * 検証・整形の純関数は ./drain-run-payload.mjs にあり、テストで固定してある。
 * 1つでも不正なら1行も書かずに exit 1（project_cards と同じ「全部揃ってから書く」原則）。
 *
 * 呼び出し側（drain.ps1）は失敗しても drain 本体を止めない。ここが落ちても
 * taskbox の実行そのものには影響しないので、異常は終了コードとstderrで伝える。
 */
/* global process, console */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { buildRow, validateRun } from './drain-run-payload.mjs'
import {
    DEFAULT_REQUEST_TIMEOUT_MS,
    armWatchdog,
    createTimeoutFetch,
    resolveTimeoutMs,
} from './supabase-timeout.mjs'

/** 画面 getDrainRuns の既定 limit（src/lib/supabase/queries/drain-runs.ts）と揃える。
 *  taskbox drainが1日4回(6時間おき)から1時間おきへ変更されたのに伴い、
 *  2026-09-11に40から48(=1時間おき24枠の2日分)へ引き上げた（ユーザー指定の切りのよい数）。 */
const DRAIN_RUNS_KEEP = 48

/**
 * 呼び出し元(taskbox/lib/board.ps1)は drain のほぼ最後にこのスクリプトを起動して待つので、
 * ここが返らないと drain.lock が解放されない。上限は ./supabase-timeout.mjs を参照。
 * 環境変数はテストで実際にタイムアウトを発火させるための口。
 */
const REQUEST_TIMEOUT_MS = resolveTimeoutMs(
    process.env.SUPABASE_REQUEST_TIMEOUT_MS,
    DEFAULT_REQUEST_TIMEOUT_MS
)
const WATCHDOG_MS = resolveTimeoutMs(process.env.UPSERT_WATCHDOG_MS, 5 * 60_000)

/**
 * process.exit() は使わない。呼び出し元(drain.ps1)は stdout/stderr をパイプで受けており、
 * 保留中のハンドルを抱えたまま即時終了すると Windows の libuv が
 * "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" を吐いて drain.log を汚す(実測)。
 * 終了コードだけ立てて自然に落とす。
 */
class PayloadError extends Error {}

function fail(message) {
    throw new PayloadError(message)
}

/**
 * 新しい順で keep 件より古い行を消す。41件目の started_at 以下をまとめて消すので、
 * 導入前に溜まっていた分も1回で片付く。keep 件以下なら何もしない。
 */
async function pruneOlderThanKeep(supabase, keep) {
    const { data, error: selectError } = await supabase
        .from('drain_runs')
        .select('started_at')
        .order('started_at', { ascending: false })
        .range(keep, keep)

    if (selectError) {
        fail(`prune select failed: ${selectError.message}`)
    }

    const cutoff = data?.[0]?.started_at
    if (!cutoff) return 0

    const { error: deleteError, count } = await supabase
        .from('drain_runs')
        .delete({ count: 'exact' })
        .lte('started_at', cutoff)

    if (deleteError) {
        fail(`prune delete failed: ${deleteError.message}`)
    }

    return count ?? 0
}

async function main() {
    const missingEnvVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter(
        (envName) => !process.env[envName]
    )
    if (missingEnvVars.length > 0) {
        fail(`missing environment variable(s): ${missingEnvVars.join(', ')}`)
    }

    const payloadPath = process.argv[2]
    if (!payloadPath) {
        fail('usage: node scripts/upsert-drain-run.mjs <payload.json>')
    }

    const source = await readFile(resolve(payloadPath), 'utf8').catch((error) => {
        fail(`failed to read payload "${payloadPath}": ${error.message}`)
    })

    let payload
    try {
        // PowerShell の Out-File -Encoding utf8 は 5.1 が BOM を付け、pwsh 7 は付けない。
        // 2026-08-15にdrainはpwsh 7へ移行したので実際にはBOMは来なくなったが、剥がす処理は無害なので残す。
        payload = JSON.parse(source.replace(/^﻿/, ''))
    } catch (error) {
        fail(`payload is not valid JSON: ${error.message}`)
    }

    const errors = validateRun(payload)
    if (errors.length > 0) {
        fail(`payload rejected (${errors.length}):\n  - ${errors.join('\n  - ')}`)
    }

    const row = buildRow(payload)
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        global: { fetch: createTimeoutFetch(REQUEST_TIMEOUT_MS) },
    })

    const { error } = await supabase.from('drain_runs').upsert(row, { onConflict: 'started_at' })
    if (error) {
        fail(`upsert failed: ${error.message}`)
    }

    const pruned = await pruneOlderThanKeep(supabase, DRAIN_RUNS_KEEP)

    console.log(
        `drain_run upserted: ${row.started_at} outcome=${row.outcome} ` +
            `steps=${row.steps.length} tasks=${row.tasks.length}`
    )
    if (pruned > 0) {
        console.log(`pruned ${pruned} drain_runs beyond keep=${DRAIN_RUNS_KEEP}`)
    }
}

const disarmWatchdog = armWatchdog('upsert-drain-run', WATCHDOG_MS)
try {
    await main()
} catch (error) {
    console.error(`Error: ${error.message}`)
    process.exitCode = 1
} finally {
    disarmWatchdog()
}
