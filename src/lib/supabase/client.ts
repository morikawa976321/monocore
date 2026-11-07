import { createBrowserClient } from '@supabase/ssr'
import { createFetchWithTimeout } from './fetch-with-timeout'

/**
 * 1回の通信の上限。超えたら abort する(理由は fetch-with-timeout.ts)。postgrest-js は GET をネットワークエラーで
 * 最大3回(1・2・4 秒待ち)やり直すので、上限を超えた GET は新しい接続でやり直される(死んだ接続からの復帰を兼ねる)。
 * 1つの GET が最悪 15×4+7=67 秒かかるため、復帰同期の上限(useSchedules.ts)はそれより長い。
 */
const REQUEST_TIMEOUT_MS = 15_000

/**
 * クライアント（ブラウザ）側でSupabaseを使用するためのクライアントを作成します。
 * 'use client' を指定したコンポーネントで使用します。
 */
export function createClient() {
    return createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        { global: { fetch: createFetchWithTimeout(REQUEST_TIMEOUT_MS) } },
    )
}
