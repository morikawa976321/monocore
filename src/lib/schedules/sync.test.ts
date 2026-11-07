import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    MAX_CONSECUTIVE_SAVE_FAILURES,
    ScheduleSaveQueue,
    SyncTimeoutError,
    applyScheduleRevisions,
    decideAfterSave,
    decodeScheduleSaveOutcome,
    runResumeSyncOnce,
    withTimeout,
    type ResumeSyncDeps,
    type ScheduleSaveOutcome,
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

describe('withTimeout', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('決着しない promise を上限時間で SyncTimeoutError にする', async () => {
        vi.useFakeTimers();
        const result = withTimeout(new Promise<never>(() => {}), 1000);
        const assertion = expect(result).rejects.toBeInstanceOf(SyncTimeoutError);
        await vi.advanceTimersByTimeAsync(1000);
        await assertion;
    });

    it('上限より前に決着すれば値も失敗もそのまま返す', async () => {
        await expect(withTimeout(Promise.resolve(7), 1000)).resolves.toBe(7);
        await expect(withTimeout(Promise.reject(new Error('boom')), 1000)).rejects.toThrow('boom');
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

describe('decideAfterSave', () => {
    // 2026-08/09 の 40001 ストームの再発防止(docs/database.md): 競合は待っても入力を変えても解消しないので、
    // 1回目で必ず打ち切る。再試行させると同じ expected_revision のまま無人で叩き続ける。
    it('suspends on the first conflict and carries the server revision', () => {
        expect(decideAfterSave({ kind: 'conflict', currentRevision: 7 }, 0)).toEqual({
            kind: 'suspend',
            reason: 'conflict',
            failures: 1,
            serverRevision: 7,
        });
    });

    it('never asks to retry after a conflict, whatever the failure count', () => {
        for (let previous = 0; previous < 10; previous++) {
            expect(decideAfterSave({ kind: 'conflict', currentRevision: 1 }, previous).kind).toBe('suspend');
        }
    });

    it('retries plain failures until the limit, then suspends', () => {
        const failed: ScheduleSaveOutcome = { kind: 'failed' };
        let failures = 0;
        const kinds: string[] = [];
        for (let attempt = 0; attempt < MAX_CONSECUTIVE_SAVE_FAILURES; attempt++) {
            const next = decideAfterSave(failed, failures);
            kinds.push(next.kind);
            if (next.kind === 'saved') throw new Error('a failure must not count as saved');
            failures = next.failures;
        }
        expect(kinds).toEqual([...Array(MAX_CONSECUTIVE_SAVE_FAILURES - 1).fill('retry'), 'suspend']);
        expect(failures).toBe(MAX_CONSECUTIVE_SAVE_FAILURES);
    });

    it('stops within the limit even when failures keep coming (no unbounded retries)', () => {
        let failures = 0;
        let calls = 0;
        for (;;) {
            calls++;
            const next = decideAfterSave({ kind: 'failed' }, failures);
            if (next.kind !== 'retry') break;
            failures = next.failures;
            if (calls > 100) throw new Error('did not stop');
        }
        expect(calls).toBe(MAX_CONSECUTIVE_SAVE_FAILURES);
    });

    it('reports a successful save with its new revision', () => {
        expect(decideAfterSave({ kind: 'saved', revision: 5 }, 2)).toEqual({ kind: 'saved', revision: 5 });
    });
});

describe('runResumeSyncOnce', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    function setup(overrides: Partial<ResumeSyncDeps> = {}) {
        const log: string[] = [];
        const deps: ResumeSyncDeps = {
            isReady: () => true,
            canSyncNow: () => true,
            waitForIdle: async () => {},
            check: async () => ({ stamp: 's1' }),
            reload: async () => {
                log.push('reload');
            },
            setLocked: (locked) => {
                log.push(locked ? 'lock' : 'unlock');
            },
            onDeferred: () => {
                log.push('deferred');
            },
            onFailed: (error) => {
                log.push(error instanceof SyncTimeoutError ? 'failed:timeout' : 'failed');
            },
            checkTimeoutMs: 1000,
            reloadTimeoutMs: 2000,
            ...overrides,
        };
        return { deps, log, running: { current: false } };
    }

    it('目印が同じなら読み直さず、ロックも掛けない', async () => {
        const { deps, log, running } = setup({ check: async () => null });
        await runResumeSyncOnce(deps, running);
        expect(log).toEqual([]);
        expect(running.current).toBe(false);
    });

    it('読み直す間だけロックを掛け、終わったら降ろす', async () => {
        const { deps, log, running } = setup();
        await runResumeSyncOnce(deps, running);
        expect(log).toEqual(['lock', 'reload', 'unlock']);
        expect(running.current).toBe(false);
    });

    it('目印の確認が決着しなくても、ロックを掛けないまま running が戻り、次の同期が走る', async () => {
        vi.useFakeTimers();
        let hang = true;
        const { deps, log, running } = setup({
            check: () => (hang ? new Promise<never>(() => {}) : Promise.resolve({ stamp: 's2' })),
        });
        const first = runResumeSyncOnce(deps, running);
        await vi.advanceTimersByTimeAsync(1000);
        await first;
        expect(log).toEqual(['failed:timeout']);
        expect(running.current).toBe(false);

        hang = false;
        await runResumeSyncOnce(deps, running);
        expect(log).toEqual(['failed:timeout', 'lock', 'reload', 'unlock']);
    });

    it('読み直しが決着しなくても、上限でロックを降ろして失敗にする(Inbox が開けなくなる不具合)', async () => {
        vi.useFakeTimers();
        const { deps, log, running } = setup({ reload: () => new Promise<never>(() => {}) });
        const run = runResumeSyncOnce(deps, running);
        await vi.advanceTimersByTimeAsync(2000);
        await run;
        expect(log).toEqual(['lock', 'failed:timeout', 'unlock']);
        expect(running.current).toBe(false);
    });

    it('同期中の呼び出しは重ねない', async () => {
        const { deps, log, running } = setup();
        const check = vi.fn(async () => ({ stamp: 's1' }));
        deps.check = check;
        await Promise.all([runResumeSyncOnce(deps, running), runResumeSyncOnce(deps, running)]);
        expect(check).toHaveBeenCalledOnce();
        expect(log).toEqual(['lock', 'reload', 'unlock']);
    });

    it('編集中なら何も読まず、見送ったと知らせる', async () => {
        const { deps, log, running } = setup({ canSyncNow: () => false });
        await runResumeSyncOnce(deps, running);
        expect(log).toEqual(['deferred']);
    });

    it('確認の間に編集が始まったら、置き換えずに見送る', async () => {
        let editing = false;
        const { deps, log, running } = setup({
            canSyncNow: () => !editing,
            check: async () => {
                editing = true;
                return { stamp: 's1' };
            },
        });
        await runResumeSyncOnce(deps, running);
        expect(log).toEqual(['deferred']);
        expect(running.current).toBe(false);
    });

    it('初回の読み込み中は何もしない', async () => {
        const { deps, log, running } = setup({ isReady: () => false });
        await runResumeSyncOnce(deps, running);
        expect(log).toEqual([]);
    });
});
