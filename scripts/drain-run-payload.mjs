/**
 * drain_runs 投入ペイロードの検証・整形（純関数のみ・DBアクセスを含まない）。
 *
 * 投入元は taskbox/drain.ps1（PowerShell）で、Monocore側のコードから型を
 * 共有できない。したがって「PS側が壊れた形を送ってきたら1行も書かずに落ちる」
 * ことがこの層の役目であり、テストで固定するのはここだけにする。
 *
 * 全件揃ってから書く原則に従う。
 */

/** run全体の結末。skipped=トリアージで理由ゼロだったためclaudeを起動していない枠。 */
const ALLOWED_OUTCOMES = new Set(['completed', 'crashed', 'skipped'])

/** 工程1件の結末。表示側の色分け（warn/error のみ強調）がこの3値に対応する。 */
const ALLOWED_STEP_STATUSES = new Set(['ok', 'warn', 'error'])

/**
 * report_text（drainセッションの最終報告の全文）の上限。
 * 通常は数KBだが、異常終了時にスタックトレース等が丸ごと入りうるので蓋をする。
 * 切り捨てたことは末尾に明示する（黙って切ると「報告が途中で終わっている」と誤読されるため）。
 */
export const MAX_REPORT_TEXT_LENGTH = 100000

const TRUNCATION_NOTICE = '\n\n…（上限を超えたため切り捨て）'

/**
 * タスク1件の要約（何のために何をして、どうなったか）の上限。
 * 規約は taskbox/README.md「板に出す文の書き方」の 1〜2文・目安120字。
 *
 * 超過を reject ではなく切り捨てで扱うのは、drain報告板がフェイルオープンだから。
 * ここで落とすと「規約違反の文が長い」の代わりに「その回の実行記録が丸ごと無い」に
 * なり、静かだったのか動かなかっただけなのかが読めなくなる（板の要件そのもの）。
 */
export const MAX_TASK_SUMMARY_LENGTH = 200

const SUMMARY_TRUNCATION_NOTICE = '…（上限超過のため切り捨て）'

/** 上限を超えた要約を、切り捨てたと分かる形で短くする。 */
function truncateSummary(text) {
    if (typeof text !== 'string') return ''
    const chars = [...text]
    if (chars.length <= MAX_TASK_SUMMARY_LENGTH) return text
    return chars.slice(0, MAX_TASK_SUMMARY_LENGTH).join('') + SUMMARY_TRUNCATION_NOTICE
}

function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** ISO日時としてパースできる文字列か。 */
function isValidTimestamp(value) {
    if (typeof value !== 'string' || value.trim().length === 0) return false
    return !Number.isNaN(Date.parse(value))
}

function asString(value) {
    return typeof value === 'string' ? value : ''
}

function asStringOrNull(value) {
    return typeof value === 'string' && value.length > 0 ? value : null
}

function asArray(value) {
    return Array.isArray(value) ? value : []
}

/** 全件を検証してエラー文字列の配列を返す。空配列なら投入してよい。 */
export function validateRun(run) {
    const errors = []

    if (!isPlainObject(run)) {
        return ['payload must be an object']
    }

    if (!isValidTimestamp(run.started_at)) {
        errors.push('field "started_at" must be an ISO timestamp string')
    }

    if (run.ended_at != null && !isValidTimestamp(run.ended_at)) {
        errors.push('field "ended_at" must be null or an ISO timestamp string')
    }

    if (typeof run.outcome !== 'string' || !ALLOWED_OUTCOMES.has(run.outcome)) {
        errors.push(`field "outcome" must be one of ${Array.from(ALLOWED_OUTCOMES).join(', ')}`)
    }

    if (run.trigger_reasons !== undefined && !Array.isArray(run.trigger_reasons)) {
        errors.push('field "trigger_reasons" must be an array')
    }

    if (run.exit_code != null && !Number.isInteger(run.exit_code)) {
        errors.push('field "exit_code" must be null or an integer')
    }

    if (run.steps !== undefined && !Array.isArray(run.steps)) {
        errors.push('field "steps" must be an array')
    }

    for (const [index, step] of asArray(run.steps).entries()) {
        if (!isPlainObject(step)) {
            errors.push(`steps[${index}] must be an object`)
            continue
        }
        if (typeof step.did !== 'string' || step.did.trim().length === 0) {
            errors.push(`steps[${index}]: field "did" must be a non-empty string`)
        }
        if (step.status !== undefined && !ALLOWED_STEP_STATUSES.has(step.status)) {
            errors.push(
                `steps[${index}]: field "status" must be one of ` +
                    Array.from(ALLOWED_STEP_STATUSES).join(', ')
            )
        }
    }

    if (run.tasks !== undefined && !Array.isArray(run.tasks)) {
        errors.push('field "tasks" must be an array')
    }

    for (const [index, task] of asArray(run.tasks).entries()) {
        if (!isPlainObject(task)) {
            errors.push(`tasks[${index}] must be an object`)
            continue
        }
        if (typeof task.task_id !== 'string' || task.task_id.trim().length === 0) {
            errors.push(`tasks[${index}]: field "task_id" must be a non-empty string`)
        }
    }

    if (run.asks !== undefined && !Array.isArray(run.asks)) {
        errors.push('field "asks" must be an array')
    }

    for (const [index, ask] of asArray(run.asks).entries()) {
        if (!isPlainObject(ask)) {
            errors.push(`asks[${index}] must be an object`)
            continue
        }
        if (typeof ask.id !== 'string' || ask.id.trim().length === 0) {
            errors.push(`asks[${index}]: field "id" must be a non-empty string`)
        }
        if (typeof ask.title !== 'string' || ask.title.trim().length === 0) {
            errors.push(`asks[${index}]: field "title" must be a non-empty string`)
        }
    }

    return errors
}

/**
 * 本人への依頼(drain_asks の行)を整形する。run の行とは別テーブルに入れる。
 * 依頼は本人が「済」にするまで残る面なので、run の保持(48件)に巻き込まない。
 * 要約と違って切り詰めない: 本人が動く必要のあるものは縮めない(docs/decisions.md /drain)。
 */
export function buildAsks(run) {
    return asArray(run.asks)
        .filter(isPlainObject)
        .map((ask) => ({
            id: ask.id.trim(),
            source: asStringOrNull(ask.source),
            title: ask.title.trim(),
            detail: asStringOrNull(ask.detail),
        }))
}

/** 工程1件をカードに出す形へ整形する。status は未指定なら ok 扱い。 */
function buildStep(step) {
    return {
        did: step.did.trim(),
        result: asString(step.result),
        status: ALLOWED_STEP_STATUSES.has(step.status) ? step.status : 'ok',
    }
}

/**
 * タスク1件を整形する。中身は taskbox/traces/<task-id>.json の部分集合で、
 * trace全体は入れない（gate.checks や artifacts まで運ぶと一覧の転送量が跳ねる。
 * 一次資料は taskbox 側にコミットされて残っている）。
 */
function buildTask(task) {
    return {
        task_id: task.task_id.trim(),
        title: asString(task.title),
        outcome: asStringOrNull(task.outcome),
        gate_passed: typeof task.gate_passed === 'boolean' ? task.gate_passed : null,
        target_dir: asStringOrNull(task.target_dir),
        // 板に出す①「何をやったか／どうなったか」は、2026-08-30に steps[] の3〜6行から
        // summary 1文へ畳んだ（本人指示「各タスクは何のために何をしてどうなった、という
        // レベルまで要約していい」）。steps[] は trace 側に残り、summary が空の回
        // ＝規約更新より前に書かれた古い trace に限って、板の本文として使われる。
        summary: truncateSummary(asString(task.summary)),
        steps: asArray(task.steps)
            .filter(isPlainObject)
            .map((step) => ({
                desc: asString(step.desc),
                status: asString(step.status),
                note: asString(step.note),
            })),
        failures: asArray(task.failures)
            .filter(isPlainObject)
            .map((failure) => ({
                phase: asString(failure.phase),
                symptom: asString(failure.symptom),
                resolution: asString(failure.resolution),
            })),
        delegation: asArray(task.delegation)
            .filter(isPlainObject)
            .map((entry) => ({
                target: asString(entry.target),
                calls: Number.isInteger(entry.calls) ? entry.calls : null,
                outcome: asString(entry.outcome),
            })),
        qa_rounds: Number.isInteger(task.qa_rounds) ? task.qa_rounds : null,
        // trace の notes（想定外に発生・発見したこと）。板が載せるべき4点
        // 「何をやったか / 成否 / 失敗の理由 / 想定外」のうち、これだけ運び先が無かった。
        notes: asString(task.notes),
    }
}

/**
 * 「静かな起動なし」か: claude を起動しなかった回(skipped)で、注意・異常の工程が1つも無い。
 * 注意・異常のある起動なし(バックアップ失敗・保留の停滞など)は本人が見るべき回なので、まとめない。
 */
export function isQuietSkip(row) {
    return (
        isPlainObject(row) &&
        row.outcome === 'skipped' &&
        asArray(row.steps).every((step) => isPlainObject(step) && (step.status ?? 'ok') === 'ok')
    )
}

/**
 * 連続する静かな起動なしを1行にまとめる(2026-10-07)。latest は投入前のいちばん新しい行(無ければ null)。
 * 両方が静かな起動なしなら、新しい行が回数と最初の時刻を引き継ぎ、latest は消す対象として返す。
 * 1時間おきの drain は大半が起動なしで、保持48件の枠を食って実働の行を約2日で押し出していた。
 */
function sameInstant(a, b) {
    const ta = Date.parse(a)
    const tb = Date.parse(b)
    if (Number.isNaN(ta) || Number.isNaN(tb)) return a === b
    return ta === tb
}

export function foldQuietSkip(row, latest) {
    if (!isQuietSkip(row)) {
        return { row, deleteStartedAt: null }
    }
    // 同じ回の再送(投入の再試行など)は、まとめ済みの回数と最初の時刻をそのまま保つ。
    // 同じ回かは文字列ではなく瞬間で比べる: payload は +09:00、DB が返す値は UTC 表記なので文字列は一致しない。
    // 文字列で比べると再送を「直前の回と連続」と誤判定し、いま書いた行を自分で消していた(2026-10-07 レビュー指摘)。
    if (isQuietSkip(latest) && sameInstant(latest.started_at, row.started_at)) {
        return {
            row: { ...row, skip_count: latest.skip_count ?? 1, skip_since: latest.skip_since ?? row.started_at },
            deleteStartedAt: null,
        }
    }
    if (!isQuietSkip(latest)) {
        return { row: { ...row, skip_count: 1, skip_since: row.started_at }, deleteStartedAt: null }
    }
    const previousCount = Number.isInteger(latest.skip_count) && latest.skip_count >= 1 ? latest.skip_count : 1
    return {
        row: {
            ...row,
            skip_count: previousCount + 1,
            skip_since: asStringOrNull(latest.skip_since) ?? latest.started_at,
        },
        deleteStartedAt: latest.started_at,
    }
}

/** 上限を超えた報告本文を、切り捨てたと分かる形で短くする。 */
export function truncateReportText(text) {
    if (typeof text !== 'string' || text.length === 0) return null
    if (text.length <= MAX_REPORT_TEXT_LENGTH) return text
    return text.slice(0, MAX_REPORT_TEXT_LENGTH) + TRUNCATION_NOTICE
}

/** 検証済みペイロードをテーブルの列そのままの行へ整形する。 */
export function buildRow(run) {
    return {
        started_at: run.started_at,
        ended_at: run.ended_at ?? null,
        outcome: run.outcome,
        trigger_reasons: asArray(run.trigger_reasons).filter((reason) => typeof reason === 'string'),
        model: asStringOrNull(run.model),
        effort: asStringOrNull(run.effort),
        exit_code: Number.isInteger(run.exit_code) ? run.exit_code : null,
        steps: asArray(run.steps).filter(isPlainObject).map(buildStep),
        tasks: asArray(run.tasks).filter(isPlainObject).map(buildTask),
        report_text: truncateReportText(run.report_text),
    }
}
