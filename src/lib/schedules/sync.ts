import { dateLabelToDateStr, type DayEntry } from './text-format';

export type ScheduleDayRevision = {
    day_key: string;
    revision: number;
};

type SupabaseErrorLike = {
    code?: string;
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

export function isScheduleRevisionConflict(error: SupabaseErrorLike | null): boolean {
    return error?.code === '40001';
}
