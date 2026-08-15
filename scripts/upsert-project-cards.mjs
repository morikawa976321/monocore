/**
 * project_cards への投入スクリプト。
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/upsert-project-cards.mjs ./scripts/project-cards.sample.json
 *
 * 入力は「カード配列」または {"cards": [...]}。
 *
 * 同期の定義は「集合の一致」であって upsert だけではない: slug単位でupsertし、
 * DBにあってJSONに無い slug は delete する（2026-08-16追加。それまでupsertのみ
 * だったため、JSONから消したカードがDBに残って板に出続けた）。全削除→再挿入は
 * 絶対にしない（slug単位のupsert/deleteのみ。過去に置換方式で実データを消した
 * 事故があるため）。JSONのカードが0件のときは同期せず異常終了する。
 *
 * 検証・整形・集合演算の純関数は ./project-cards-payload.mjs 側にあり、
 * テストで固定してある。
 */
/* global process, console */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import {
    buildRow,
    computeStaleSlugs,
    normalizeCards,
    validateCards,
} from './project-cards-payload.mjs'

function fail(message) {
    console.error(`Error: ${message}`)
    process.exit(1)
}

async function main() {
    const missingEnvVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter(
        (envName) => !process.env[envName]
    )
    if (missingEnvVars.length > 0) {
        fail(`missing environment variable(s): ${missingEnvVars.join(', ')}`)
    }

    const inputPath = process.argv[2]
    if (!inputPath) {
        fail('missing JSON path argument (argv[2])')
    }

    const resolvedPath = resolve(inputPath)
    const fileText = await readFile(resolvedPath, 'utf8').catch((error) => {
        fail(`failed to read JSON file "${resolvedPath}": ${error.message}`)
    })

    let payload
    try {
        payload = JSON.parse(fileText)
    } catch (error) {
        fail(`failed to parse JSON file "${resolvedPath}": ${error.message}`)
    }
    const cards = normalizeCards(payload)
    if (!cards) {
        fail('JSON root must be an array of cards or an object containing "cards": []')
    }

    // 1件でも不正なら1行も書かない。整形・接続より前に全件を検証する。
    const validationErrors = validateCards(cards)
    if (validationErrors.length > 0) {
        for (const error of validationErrors) {
            console.error(`Validation: ${error}`)
        }
        process.exit(1)
    }

    // カードが0件のJSONは、入力ファイルの取り違え・生成の失敗の可能性が高い。
    // ここで進めると「集合の一致」がDBの全行をdelete対象と判定する（=置換方式の
    // 事故と同じ帰結）ので、接続する前に何もせず異常終了する。
    if (cards.length === 0) {
        fail(`no cards found in "${resolvedPath}" — refusing to sync (would delete all DB rows)`)
    }

    const rows = cards.map(buildRow)
    const localSlugs = new Set(rows.map((row) => row.slug))
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    const { data, error } = await supabase
        .from('project_cards')
        .upsert(rows, { onConflict: 'slug' })
        .select('slug')

    if (error) {
        fail(`upsert failed: ${error.message}`)
    }

    const { data: existingRows, error: selectError } = await supabase
        .from('project_cards')
        .select('slug')
    if (selectError) {
        fail(`failed to read existing slugs: ${selectError.message}`)
    }

    const staleSlugs = computeStaleSlugs(
        (existingRows ?? []).map((row) => row.slug),
        localSlugs
    )

    let deletedSlugs = []
    if (staleSlugs.length > 0) {
        const { error: deleteError } = await supabase
            .from('project_cards')
            .delete()
            .in('slug', staleSlugs)
        if (deleteError) {
            fail(`delete failed: ${deleteError.message}`)
        }
        deletedSlugs = staleSlugs
    }

    const upsertedSlugs = (data ?? []).map((row) => row.slug)
    console.log(`Cards read: ${cards.length}`)
    console.log(`Cards upserted: ${upsertedSlugs.length}`)
    console.log(`Cards deleted: ${deletedSlugs.length}`)
    if (deletedSlugs.length > 0) {
        console.log(`Deleted slugs: ${deletedSlugs.join(', ')}`)
    }
    console.log(`Slugs: ${upsertedSlugs.join(', ')}`)
}

await main()
