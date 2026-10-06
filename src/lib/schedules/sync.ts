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
