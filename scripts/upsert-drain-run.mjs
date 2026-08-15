/**
 * drain_runs への投入スクリプト（taskbox/drain.ps1 → public.drain_runs）。
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/upsert-drain-run.mjs <payload.json>
 *
 * 1回の呼び出しで1枠（1 run）だけを書く。キーは started_at で、同じ枠を
 * 二度投げても行は増えない（upsert）。**削除は一切しない** — reports の
 * 「集合の一致」とは方針が違い、こちらは追記専用の実行履歴だからである
 * （ローカルの drain.log は7日で消えるので、ローカルに無い＝消してよい、が成り立たない）。
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
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

    const { error } = await supabase.from('drain_runs').upsert(row, { onConflict: 'started_at' })
    if (error) {
        fail(`upsert failed: ${error.message}`)
    }

    console.log(
        `drain_run upserted: ${row.started_at} outcome=${row.outcome} ` +
            `steps=${row.steps.length} tasks=${row.tasks.length}`
    )
}

try {
    await main()
} catch (error) {
    console.error(`Error: ${error.message}`)
    process.exitCode = 1
}
