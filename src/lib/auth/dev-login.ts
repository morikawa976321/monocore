import type { SupabaseClient } from '@supabase/supabase-js'
import { getDevAuthCredentials, isDevAuthBypassEnabled } from './dev-bypass'

/**
 * 開発サーバーでの自動ログイン。AuthGate が `import.meta.env.DEV` の中でだけ動的に読むので、本番ビルドには
 * 含まれない(含まれていないことは、ビルド後に dist を grep して確かめる)。
 * ローカル Supabase なら開発ユーザー(無ければ作る)で、それ以外は VITE_DEV_AUTH_* があればそれで入る。
 */

// ページを開き直すまで 1 回だけ試す(失敗をページ遷移のたびに繰り返さない)。
let attempt: Promise<boolean> | null = null

/** 入れたかどうかを返す。条件に合わない(自動ログインの対象外)ときは false。 */
export function signInForDev(supabase: SupabaseClient): Promise<boolean> {
    if (!isDevAuthBypassEnabled()) return Promise.resolve(false)
    attempt ??= tryDevPasswordSignIn(supabase)
    return attempt
}

async function tryDevPasswordSignIn(supabase: SupabaseClient): Promise<boolean> {
    const credentials = getDevAuthCredentials()
    if (!credentials) return false

    const { email, password, canSignUp } = credentials
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (!signInError) return true
    if (!canSignUp) return false

    const { data, error: signUpError } = await supabase.auth.signUp({ email, password })
    if (signUpError) return false
    if (data.session) return true

    const retry = await supabase.auth.signInWithPassword({ email, password })
    return !retry.error
}
