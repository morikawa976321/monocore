import { dateLabelToDateStr, type DayEntry } from './text-format';

export type ScheduleDayRevision = {
    day_key: string;
    revision: number;
};

export class ScheduleSaveQueue {
    private readonly pendingByDay = new Map<string, Promise<unknown>>();

    enqueue<T>(dayKey: string, task: () => Promise<T>): Promise<T> {
        const previous = this.pendingByDay.get(dayKey) ?? Promise.resolve();
        const current = previous.catch(() => undefined).then(task);
        this.pendingByDay.set(dayKey, current);

        const cleanup = () => {
            if (this.pendingByDay.get(dayKey) === current) {
                this.pendingByDay.delete(dayKey);
            }
        };
        void current.then(cleanup, cleanup);

        return current;
    }

    async waitForIdle(): Promise<void> {
        while (this.pendingByDay.size > 0) {
            await Promise.allSettled([...this.pendingByDay.values()]);
        }
    }
}

export function applyScheduleRevisions(
    entries: DayEntry[],
    revisions: ScheduleDayRevision[]
): DayEntry[] {
    const revisionByDay = new Map(revisions.map((row) => [row.day_key, row.revision]));
    return entries.map((entry) => ({
        ...entry,
        revision: revisionByDay.get(dateLabelToDateStr(entry.dateLabel)) ?? 0,
    }));
}

/**
 * 同じ日の自動保存が連続でこの回数失敗したら、その日の自動保存を打ち切る。
 * 失敗し続ける保存を無人でリトライすると、1クライアントがDBのエラーログだけで
 * インスタンスのDisk IOを飽和させる(2026-08-25の実障害)。人が編集し直せば解除される。
 */
export const MAX_CONSECUTIVE_SAVE_FAILURES = 3;

/** `replace_schedules_for_day` の1回の呼び出しがどう終わったか。 */
export type ScheduleSaveOutcome =
    | { kind: 'saved'; revision: number }
    | { kind: 'conflict'; currentRevision: number }
    | { kind: 'failed' };

/**
 * `replace_schedules_for_day` の戻り値を読む。
 *
 * migration 20260902001000 以降、競合は例外ではなく負の戻り値（`-1 - current`）で返る。
 * 例外をやめたのは、`RAISE EXCEPTION` が競合のたびにPostgresのエラーログを1行書き、
 * 打ち切りを実装していないクライアントが1つあるだけでインスタンスのDisk IOを
 * 飽和させられたため（2026-08-25 / 2026-09-01 の実障害）。
 *
 * 符号で分けているのは、競合相手が1回だけ書いた「最も普通の競合」で
 * current === expected + 1 となり、成功時の戻り値と一致してしまうから。
 * revision は CHECK (revision >= 0) なので、成功は必ず 1 以上・競合は必ず -1 以下になる。
 */
export function decodeScheduleSaveOutcome(value: number | null | undefined): ScheduleSaveOutcome {
    if (value == null || !Number.isInteger(value) || value === 0) return { kind: 'failed' };
    if (value < 0) return { kind: 'conflict', currentRevision: -1 - value };
    return { kind: 'saved', revision: value };
}

/**
 * 1回の保存の結果を受けて、その日の自動保存をどうするか(useSchedules の保存処理はこれに従う)。
 * - saved: 失敗の回数を消し、新しい版を取り込む
 * - suspend: dirty を落としてその日の自動保存を打ち切る(人の編集か再読み込みでだけ再開する)
 * - retry: dirty を残し、次の保存で試す
 *
 * 楽観ロックの競合ハンドラには「次の試行が前回と違う入力になる保証」か「試行を止める保証」のどちらかが要る
 * (docs/database.md、2026-08/09 の 40001 ストーム)。競合は同じ expected_revision のまま何度試しても解消しない
 * ので、1回目で必ず打ち切る。失敗は通信の一時的な問題でありうるので、maxFailures 回目まで続けてから打ち切る。
 */
export type SaveFollowUp =
    | { kind: 'saved'; revision: number }
    | { kind: 'suspend'; reason: 'conflict'; failures: number; serverRevision: number }
    | { kind: 'suspend'; reason: 'failed'; failures: number }
    | { kind: 'retry'; failures: number };

export function decideAfterSave(
    outcome: ScheduleSaveOutcome,
    previousFailures: number,
    maxFailures: number = MAX_CONSECUTIVE_SAVE_FAILURES,
): SaveFollowUp {
    if (outcome.kind === 'saved') return { kind: 'saved', revision: outcome.revision };
    const failures = previousFailures + 1;
    if (outcome.kind === 'conflict') {
        return { kind: 'suspend', reason: 'conflict', failures, serverRevision: outcome.currentRevision };
    }
    if (failures >= maxFailures) return { kind: 'suspend', reason: 'failed', failures };
    return { kind: 'retry', failures };
}
