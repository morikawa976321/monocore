import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { createFetchWithTimeout } from './fetch-with-timeout'

/**
 * 1回の通信の上限。超えたら abort する(理由は fetch-with-timeout.ts)。postgrest-js は GET をネットワークエラーで
 * 最大3回(1・2・4 秒待ち)やり直すので、上限を超えた GET は新しい接続でやり直される(死んだ接続からの復帰を兼ねる)。
 * 1つの GET が最悪 15×4+7=67 秒かかるため、復帰同期の上限(useSchedules.ts)はそれより長い。
 */
const REQUEST_TIMEOUT_MS = 15_000

let client: SupabaseClient | null = null

/**
 * ブラウザで Supabase を使うクライアント。アプリ全体で 1 つを使い回す(呼ぶたびに作ると、
 * 同じ保存先を触る認証クライアントが複数でき、警告と競合が出る)。
 *
 * 認証の設定(確かめた先: @supabase/auth-js の GoTrueClient の既定値と、@supabase/ssr の createBrowserClient):
 * - flowType: 'pkce' — supabase-js の既定は implicit で、そのままだと Magic Link が ?code= を交換する流れにならない。
 * - detectSessionInUrl: false — PKCE では SDK が初期化時に ?code= を自動で交換するが、交換は
 *   src/app/auth/callback/page.tsx の 1 か所だけで行う(重複するとコードが 1 回しか使えず失敗する)。
 * セッションは localStorage に保存される(@supabase/ssr の Cookie ではない)。
 */
export function createClient(): SupabaseClient {
    client ??= createSupabaseClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        {
            auth: { flowType: 'pkce', detectSessionInUrl: false },
            global: { fetch: createFetchWithTimeout(REQUEST_TIMEOUT_MS) },
        },
    )
    return client
}
