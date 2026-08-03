/**
 * project_cards への投入スクリプト。
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/upsert-project-cards.mjs ./scripts/project-cards.sample.json
 *
 * 入力は「カード配列」または {"cards": [...]}。slug単位のupsertのみを行い、
 * 削除・全置換は一切しない（過去に置換方式で実データを消した事故があるため）。
 * 検証・整形の純関数は ./project-cards-payload.mjs 側にあり、テストで固定してある。
 */
/* global process, console */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { buildRow, normalizeCards, validateCards } from './project-cards-payload.mjs'

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

    const rows = cards.map(buildRow)
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    const { data, error } = await supabase
        .from('project_cards')
        .upsert(rows, { onConflict: 'slug' })
        .select('slug')

    if (error) {
        fail(`upsert failed: ${error.message}`)
    }

    const upsertedSlugs = (data ?? []).map((row) => row.slug)
    console.log(`Cards read: ${cards.length}`)
    console.log(`Cards upserted: ${upsertedSlugs.length}`)
    console.log(`Slugs: ${upsertedSlugs.join(', ')}`)
}

await main()
