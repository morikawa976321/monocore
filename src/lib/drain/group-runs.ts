import type { DrainRunListRow } from '@/src/lib/supabase/queries/drain-runs'

/**
 * 一覧で隣接する 'skipped'(起動なし)を1グループへまとめる。
 *
 * 1時間おき運用では「やることが無い」「生きている別drainが実行中」のどちらも正常系
 * (taskbox側の判断)で、連続して並びやすい。2件以上連続したときだけ畳み、孤立した
 * 1件は従来どおり個別カードのまま出す(2026-09-11ユーザー指定)。'completed'/'crashed'は
 * 対象外 — 'crashed' はそれ自体が異常の合図なので、畳んで埋もれさせない。
 *
 * runs は getDrainRuns と同じ started_at 降順(新しい順)を前提とする。
 */
export type DrainRunDisplayItem =
    | { kind: 'run'; run: DrainRunListRow }
    | { kind: 'skipped-group'; runs: DrainRunListRow[] }

export function groupDrainRuns(runs: DrainRunListRow[]): DrainRunDisplayItem[] {
    const items: DrainRunDisplayItem[] = []
    let buffer: DrainRunListRow[] = []

    const flush = () => {
        if (buffer.length === 0) return
        if (buffer.length === 1) {
            items.push({ kind: 'run', run: buffer[0] })
        } else {
            items.push({ kind: 'skipped-group', runs: buffer })
        }
        buffer = []
    }

    for (const run of runs) {
        if (run.outcome === 'skipped') {
            buffer.push(run)
        } else {
            flush()
            items.push({ kind: 'run', run })
        }
    }
    flush()

    return items
}
