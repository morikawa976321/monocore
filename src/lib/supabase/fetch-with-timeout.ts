/**
 * 通信に上限時間を付けた fetch。Supabase クライアントの `global.fetch` に渡すと、REST と認証(/token の更新)の
 * 両方に効く(supabase-js は auth にも同じ `global.fetch` を渡す)。
 *
 * fetch には既定のタイムアウトが無い。スマホはバックグラウンド中にソケットを切るので、復帰直後に死んだ接続へ
 * 送ったリクエストが、成功も失敗もしないまま残ることがある。それを待つ側(Schedules の復帰同期)は
 * 編集ロックを掛けたままになる(docs/decisions.md「復帰同期のタイムアウト」)。
 *
 * タイマーは応答が返っても止めない。止めるとボディの受信中に止まった場合を拾えない。完了済みの通信への
 * abort は何も起こさない。
 */
export function createFetchWithTimeout(
    timeoutMs: number,
    baseFetch: typeof fetch = (input, init) => fetch(input, init),
): typeof fetch {
    return (input, init) => {
        const controller = new AbortController();
        const outer = init?.signal ?? (input instanceof Request ? input.signal : undefined);
        if (outer) {
            if (outer.aborted) controller.abort(outer.reason);
            else outer.addEventListener('abort', () => controller.abort(outer.reason), { once: true });
        }
        setTimeout(() => controller.abort(new DOMException('通信がタイムアウトしました', 'TimeoutError')), timeoutMs);
        return baseFetch(input, { ...init, signal: controller.signal });
    };
}
