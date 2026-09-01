import { describe, expect, it, vi } from 'vitest';
import {
    ScheduleSaveQueue,
    applyScheduleRevisions,
    decodeScheduleSaveOutcome,
    isScheduleRevisionConflict,
} from './sync';

describe('ScheduleSaveQueue', () => {
    it('serializes saves for the same day', async () => {
        const queue = new ScheduleSaveQueue();
        let releaseFirst!: () => void;
        const firstBlocked = new Promise<void>((resolve) => {
            releaseFirst = resolve;
        });
        const order: string[] = [];

        const first = queue.enqueue('2026-08-03', async () => {
            order.push('first:start');
            await firstBlocked;
            order.push('first:end');
        });
        const secondTask = vi.fn(async () => {
            order.push('second');
        });
        const second = queue.enqueue('2026-08-03', secondTask);

        await Promise.resolve();
        expect(secondTask).not.toHaveBeenCalled();

        releaseFirst();
        await Promise.all([first, second]);
        expect(order).toEqual(['first:start', 'first:end', 'second']);
    });

    it('allows different days to save independently', async () => {
        const queue = new ScheduleSaveQueue();
        let releaseFirst!: () => void;
        const firstBlocked = new Promise<void>((resolve) => {
            releaseFirst = resolve;
        });
        const otherDayTask = vi.fn(async () => undefined);

        const first = queue.enqueue('2026-08-03', () => firstBlocked);
        const other = queue.enqueue('2026-08-04', otherDayTask);

        await other;
        expect(otherDayTask).toHaveBeenCalledOnce();
        releaseFirst();
        await first;
    });

    it('continues the queue after a failed save', async () => {
        const queue = new ScheduleSaveQueue();
        const secondTask = vi.fn(async () => undefined);

        const first = queue.enqueue('2026-08-03', async () => {
            throw new Error('save failed');
        });
        const second = queue.enqueue('2026-08-03', secondTask);

        await expect(first).rejects.toThrow('save failed');
        await second;
        expect(secondTask).toHaveBeenCalledOnce();
    });

    it('waits until all queued saves settle', async () => {
        const queue = new ScheduleSaveQueue();
        let release!: () => void;
        const blocked = new Promise<void>((resolve) => {
            release = resolve;
        });
        const settled = vi.fn();

        void queue.enqueue('2026-08-03', () => blocked);
        const waiting = queue.waitForIdle().then(settled);

        await Promise.resolve();
        expect(settled).not.toHaveBeenCalled();
        release();
        await waiting;
        expect(settled).toHaveBeenCalledOnce();
    });
});

describe('applyScheduleRevisions', () => {
    it('adds fetched revisions and defaults missing days to zero', () => {
        const entries = [
            { dateLabel: '2026/08/03 (月)', content: '0900 work', revision: 99 },
            { dateLabel: '2026/08/04 (火)', content: '', revision: 99 },
        ];

        expect(
            applyScheduleRevisions(entries, [{ day_key: '2026-08-03', revision: 4 }])
        ).toEqual([
            { dateLabel: '2026/08/03 (月)', content: '0900 work', revision: 4 },
            { dateLabel: '2026/08/04 (火)', content: '', revision: 0 },
        ]);
    });
});

describe('isScheduleRevisionConflict', () => {
    it('recognizes the database conflict error code', () => {
        expect(isScheduleRevisionConflict({ code: '40001' })).toBe(true);
        expect(isScheduleRevisionConflict({ code: '23505' })).toBe(false);
        expect(isScheduleRevisionConflict(null)).toBe(false);
    });
});

describe('decodeScheduleSaveOutcome', () => {
    it('reads a positive return value as the new revision', () => {
        expect(decodeScheduleSaveOutcome(1)).toEqual({ kind: 'saved', revision: 1 });
        expect(decodeScheduleSaveOutcome(62)).toEqual({ kind: 'saved', revision: 62 });
    });

    it('reads a negative return value as a conflict carrying the server revision', () => {
        expect(decodeScheduleSaveOutcome(-1)).toEqual({ kind: 'conflict', currentRevision: 0 });
        expect(decodeScheduleSaveOutcome(-62)).toEqual({ kind: 'conflict', currentRevision: 61 });
    });

    // これが符号で分けている理由そのもの。競合相手が1回だけ書いた「最も普通の競合」では
    // current === expected + 1 になるので、「expected + 1 なら成功」では見分けられない。
    // 見分けられないと競合を成功と誤読してdirtyを落とし、編集内容が無言で消える。
    it('separates a conflict at expected+1 from a successful save of the same number', () => {
        const expectedRevision = 61;
        const savedNext = decodeScheduleSaveOutcome(expectedRevision + 1);
        const conflictAtNext = decodeScheduleSaveOutcome(-1 - (expectedRevision + 1));

        expect(savedNext).toEqual({ kind: 'saved', revision: 62 });
        expect(conflictAtNext).toEqual({ kind: 'conflict', currentRevision: 62 });
    });

    it('treats a missing or nonsensical return value as a plain failure', () => {
        expect(decodeScheduleSaveOutcome(null)).toEqual({ kind: 'failed' });
        expect(decodeScheduleSaveOutcome(undefined)).toEqual({ kind: 'failed' });
        // 0 は成功でも競合でも返らない（revision は CHECK (revision >= 0) で、
        // 成功は必ず 1 以上・競合は必ず -1 以下）。
        expect(decodeScheduleSaveOutcome(0)).toEqual({ kind: 'failed' });
        expect(decodeScheduleSaveOutcome(1.5)).toEqual({ kind: 'failed' });
    });
});
