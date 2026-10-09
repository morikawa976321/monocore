/**
 * reports への投入スクリプト（mf/reports/*.md → public.reports）。
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/upsert-reports.mjs [reportsDir]
 *
 * 引数省略時は monocore と同じ階層(mf/)にある reports/ を対象にする。
 * 環境変数は`~/.monocore/config.json`のenvs.remote（既定はremote）から
 * 呼び出し側が読み、このスクリプト自身は config.jsonを読まず、
 * 呼び出し側が値を環境変数として渡す
 * （taskbox/README.mdの `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node ...`
 * という既存の呼び出し方に揃えるため。ローカルSupabaseを指す等の差し替えも
 * この形なら環境変数を変えるだけで済む）。
 *
 * 同期の定義は「集合の一致」であって upsert だけではない: reportsDir 直下
 * （archive/・CLAUDE.md・_index.md は対象外）をスキャンして slug 単位で upsert し、
 * DB にあってローカルに無い slug は delete する。archive移動・削除・リネームを
 * 個別に扱わず、この1つの仕組みで処理する。全削除→再挿入は絶対にしない
 * （slug単位のupsert/deleteのみ。過去に置換方式で実データを消した事故があるため）。
 *
 * 変換パイプラインは remark-parse → remark-gfm → (他レポートへの相対リンク書き換え)
 * → remark-rehype → rehype-slug → rehype-sanitize → rehype-stringify。
 * toc は同じASTから抽出する（2回パースしない）。
 *
 * 集合演算・フィルタ・リンク書き換え・セクション分割の純関数は
 * ./reports-payload.mjs にあり、テストで固定してある。
 */
/* global process, console */

import { readFile, readdir, stat } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeSlug from 'rehype-slug'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import { visit } from 'unist-util-visit'
import { toString as hastToString } from 'hast-util-to-string'
import { toString as mdastToString } from 'mdast-util-to-string'
import { computeStaleSlugs, filterReportFilenames, rewriteReportLinkUrl, sectionizeChildren } from './reports-payload.mjs'
import {
    DEFAULT_REQUEST_TIMEOUT_MS,
    armWatchdog,
    createTimeoutFetch,
    resolveTimeoutMs,
} from './supabase-timeout.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
// scripts/ の2つ上 = mf/。reportsとmonocoreは兄弟ディレクトリ。
const DEFAULT_REPORTS_DIR = resolve(scriptDir, '..', '..', 'reports')

/**
 * 呼び出し元(ops/sync-reports.ps1。2026-10-09まで taskbox/sync-reports.ps1)はこのスクリプトの終了を待つ。claudeを起動しない回でも
 * 通る経路なので、ここが返らないと drain.lock を抱えたまま枠が潰れる。上限は
 * ./supabase-timeout.mjs を参照。環境変数はテストで実際に発火させるための口。
 */
const REQUEST_TIMEOUT_MS = resolveTimeoutMs(
    process.env.SUPABASE_REQUEST_TIMEOUT_MS,
    DEFAULT_REQUEST_TIMEOUT_MS
)
const WATCHDOG_MS = resolveTimeoutMs(process.env.UPSERT_WATCHDOG_MS, 10 * 60_000)

/**
 * process.exit() は使わない。2026-08-12から taskbox/sync-reports.ps1（drainの工程）が
 * 出力をパイプで受けて呼ぶようになったため、保留中のstdioハンドルを抱えたまま即時終了すると
 * Windowsのlibuvが "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" を吐き、
 * 本当の失敗理由の隣に並んで原因の切り分けを鈍らせる（upsert-drain-run.mjs と同じ対処）。
 */
class ReportSyncError extends Error {}

function fail(message) {
    throw new ReportSyncError(message)
}

/**
 * rehype-sanitizeの既定スキーマは見出しのid属性そのものは残すが、
 * clobberPrefix（既定 "user-content-"）でDOMクロバリング対策のため書き換える。
 * ここでtocのanchorに使うidと、実際にbody_htmlへ出力されるidがズレると
 * 目次アンカーが全滅する。ここは外部ユーザー入力ではなく自分のmarkdownしか
 * 扱わないため、clobberPrefixを空にして無効化してよいと判断した。
 * 加えてsection要素をセクション分割のために許可する。
 */
function buildSanitizeSchema() {
    const schema = structuredClone(defaultSchema)
    schema.clobberPrefix = ''
    schema.tagNames = [...(schema.tagNames ?? []), 'section']
    return schema
}

/** 他レポートへの相対リンク(`foo.md`)を`/reports/foo`へ書き換えるremarkプラグイン。 */
function remarkRewriteReportLinks(localSlugs) {
    return (tree) => {
        visit(tree, 'link', (node) => {
            node.url = rewriteReportLinkUrl(node.url, localSlugs)
        })
    }
}

/** 見出し(h1-h6)を集めてtocを作る。rehype-slugが振ったidをそのままanchorに使う。 */
function extractToc(tree) {
    const toc = []
    visit(tree, 'element', (node) => {
        const match = /^h([1-6])$/.exec(node.tagName)
        if (!match) return
        const id = node.properties?.id
        if (typeof id !== 'string' || id.length === 0) return
        toc.push({
            level: Number(match[1]),
            text: hastToString(node),
            anchor: id,
        })
    })
    return toc
}

/** 本文中の最初の `# ` 見出し(h1)のテキストを返す。無ければnull。 */
function extractTitle(mdastTree) {
    let title = null
    visit(mdastTree, 'heading', (node) => {
        if (title !== null) return
        if (node.depth !== 1) return
        title = mdastToString(node)
    })
    return title
}

async function listReportFiles(reportsDir) {
    const entries = await readdir(reportsDir, { withFileTypes: true })
    const filenames = entries.filter((entry) => entry.isFile()).map((entry) => entry.name)
    return filterReportFilenames(filenames)
}

async function buildRow(reportsDir, filename, schema, localSlugs) {
    const filePath = join(reportsDir, filename)
    const [source, fileStat] = await Promise.all([readFile(filePath, 'utf8'), stat(filePath)])
    const slug = basename(filename, '.md')

    const toHast = unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkRewriteReportLinks, localSlugs)
        .use(remarkRehype)
        .use(rehypeSlug)
    const mdastTree = toHast.parse(source)
    const hastTree = toHast.runSync(mdastTree)
    hastTree.children = sectionizeChildren(hastTree.children)

    const toc = extractToc(hastTree)
    const title = extractTitle(mdastTree) ?? slug

    const sanitizedTree = unified().use(rehypeSanitize, schema).runSync(hastTree)
    const bodyHtml = String(unified().use(rehypeStringify).stringify(sanitizedTree))

    return {
        slug,
        title,
        body_html: bodyHtml,
        toc,
        updated_at: fileStat.mtime.toISOString(),
    }
}

async function main() {
    const missingEnvVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter(
        (envName) => !process.env[envName]
    )
    if (missingEnvVars.length > 0) {
        fail(`missing environment variable(s): ${missingEnvVars.join(', ')}`)
    }

    const reportsDir = resolve(process.argv[2] ?? DEFAULT_REPORTS_DIR)
    const filenames = await listReportFiles(reportsDir).catch((error) => {
        fail(`failed to read reports directory "${reportsDir}": ${error.message}`)
    })

    // ローカルに1件もファイルが見つからない場合、reportsDirの指定ミス等の
    // 可能性が高い。ここで進めると「集合の一致」ロジックがDBの全行を
    // delete対象と判定してしまう（=置換方式の事故と同じ帰結）ので、
    // 何もせず異常終了する。
    if (!filenames || filenames.length === 0) {
        fail(
            `no report files found in "${reportsDir}" — refusing to sync (would delete all DB rows)`
        )
    }

    const localSlugs = new Set(filenames.map((filename) => basename(filename, '.md')))
    const schema = buildSanitizeSchema()
    const rows = []
    for (const filename of filenames) {
        rows.push(await buildRow(reportsDir, filename, schema, localSlugs))
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        global: { fetch: createTimeoutFetch(REQUEST_TIMEOUT_MS) },
    })

    const { data: upserted, error: upsertError } = await supabase
        .from('reports')
        .upsert(rows, { onConflict: 'slug' })
        .select('slug')
    if (upsertError) {
        fail(`upsert failed: ${upsertError.message}`)
    }

    const { data: existingRows, error: selectError } = await supabase.from('reports').select('slug')
    if (selectError) {
        fail(`failed to read existing slugs: ${selectError.message}`)
    }

    const staleSlugs = computeStaleSlugs(
        (existingRows ?? []).map((row) => row.slug),
        localSlugs
    )

    let deletedSlugs = []
    if (staleSlugs.length > 0) {
        const { error: deleteError } = await supabase.from('reports').delete().in('slug', staleSlugs)
        if (deleteError) {
            fail(`delete failed: ${deleteError.message}`)
        }
        deletedSlugs = staleSlugs
    }

    const upsertedSlugs = (upserted ?? []).map((row) => row.slug)
    console.log(`Reports read: ${rows.length}`)
    console.log(`Reports upserted: ${upsertedSlugs.length}`)
    console.log(`Reports deleted: ${deletedSlugs.length}`)
    if (deletedSlugs.length > 0) {
        console.log(`Deleted slugs: ${deletedSlugs.join(', ')}`)
    }
}

const disarmWatchdog = armWatchdog('upsert-reports', WATCHDOG_MS)
try {
    await main()
} catch (error) {
    console.error(`Error: ${error.message}`)
    process.exitCode = 1
} finally {
    disarmWatchdog()
}
