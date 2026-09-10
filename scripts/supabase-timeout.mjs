/**
 * Supabase 呼び出しに上限を与えるための共通部品（2026-09-10追加）。
 *
 * 背景: taskbox の drain パイプラインは、報告板投入(upsert-drain-run.mjs)と reports 同期
 * (upsert-reports.mjs)を `node <script>` で呼んで**その終了を待つ**。supabase-js の
 * `.upsert()/.select()/.delete()` にはタイムアウトが無いため、ネットワーク越しの応答が
 * 返らないとこの node プロセスが居座り、呼び出し元の drain wrapper ごと止まる。すると
 * `drain.lock` が解放されず、次の枠が「生きている別drainのロック」と誤認してスキップし続ける。
 *
 * ここが保証するのは「**返ってくること**」だけで、失敗の扱いは呼び出し元
 * (taskbox/lib/board.ps1・taskbox/sync-reports.ps1)の既存のエラーハンドリングに委ねる。
 *
 * @module supabase-timeout
 */
/* global process, AbortSignal, fetch */

import { writeSync } from 'node:fs'

/** 1リクエストあたりの上限(ms)。実測に基づく値ではなく「無期限に待たない」ための暫定値。 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 60_000

/**
 * 環境変数で上限を上書きする（テストで実際にタイムアウトを発火させるための口）。
 * 正の有限数でなければ既定値を使う。
 */
export function resolveTimeoutMs(envValue, fallback) {
    const parsed = Number(envValue)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * createClient(url, key, { global: { fetch: createTimeoutFetch() } }) の形で使う。
 * supabase-js 側が独自の signal を渡してくる経路（.abortSignal() 等）でも取りこぼさないよう
 * AbortSignal.any で合成する。
 */
export function createTimeoutFetch(timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
    return (input, init = {}) => {
        const timeoutSignal = AbortSignal.timeout(timeoutMs)
        const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal
        return fetch(input, { ...init, signal })
    }
}

/**
 * 全体の番人。fetch 単位の上限では捕まえられない停止（未知のハンドルが event loop を
 * 掴んだまま等）に対する最後の防衛線で、**発火したら process.exit する**。
 *
 * - `unref()` してあるので、正常に仕事が終わったプロセスの寿命は1msも延ばさない
 *   （event loop が空になれば、このタイマーは発火せずプロセスが終わる）。逆に何かが
 *   event loop を掴んだままなら、そのときだけ発火する。
 * - このリポジトリの投入スクリプトは通常 `process.exit()` を使わない（保留中のstdioを
 *   抱えたまま即時終了すると Windows の libuv が "Assertion failed" を吐くため）。
 *   ここは**既に異常な経路**であり、ログが1行汚れることより無人パイプラインを塞がない
 *   ことを優先する。理由が失われないよう、終了直前に fd 2 へ同期書き込みしておく。
 */
export function armWatchdog(label, timeoutMs) {
    const timer = setTimeout(() => {
        try {
            writeSync(2, `Error: ${label} watchdog fired after ${timeoutMs}ms - forcing exit\n`)
        } catch {
            // 書けなくても終了は続ける
        }
        process.exit(1)
    }, timeoutMs)
    timer.unref()
    return () => clearTimeout(timer)
}
