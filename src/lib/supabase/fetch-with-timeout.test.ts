import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFetchWithTimeout } from './fetch-with-timeout';

/** signal が abort されたら reject する fetch(決着しない通信の代わり)。 */
function hangingFetch(): typeof fetch {
    return (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        });
}

afterEach(() => {
    vi.useRealTimers();
});

describe('createFetchWithTimeout', () => {
    it('決着しない通信を上限時間で abort する', async () => {
        vi.useFakeTimers();
        const wrapped = createFetchWithTimeout(1000, hangingFetch());
        const result = wrapped('https://example.test/x');
        const assertion = expect(result).rejects.toMatchObject({ name: 'TimeoutError' });
        await vi.advanceTimersByTimeAsync(1000);
        await assertion;
    });

    it('上限より前に返った応答はそのまま返す', async () => {
        vi.useFakeTimers();
        const response = new Response('ok');
        const wrapped = createFetchWithTimeout(1000, async () => response);
        await expect(wrapped('https://example.test/x')).resolves.toBe(response);
    });

    it('呼び出し側の signal が abort されたら通信も abort する', async () => {
        const outer = new AbortController();
        const wrapped = createFetchWithTimeout(60_000, hangingFetch());
        const result = wrapped('https://example.test/x', { signal: outer.signal });
        outer.abort(new Error('cancelled'));
        await expect(result).rejects.toThrow('cancelled');
    });
});
