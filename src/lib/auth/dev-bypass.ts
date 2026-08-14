/**
 * `npm run dev` のときだけログインゲートを外す。
 * 本番 (`next start` / Vercel) は NODE_ENV=production なので必ず false。
 * ログイン画面を確認したいときは DEV_AUTH_BYPASS=0。
 */
export function isDevAuthBypassEnabled(
    nodeEnv: string | undefined = process.env.NODE_ENV,
    flag: string | undefined = process.env.DEV_AUTH_BYPASS,
): boolean {
    if (nodeEnv !== 'development') return false
    if (flag === '0' || flag === 'false') return false
    return true
}

export function isLocalSupabaseUrl(url: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL): boolean {
    if (!url) return false
    try {
        const host = new URL(url).hostname
        return host === '127.0.0.1' || host === 'localhost'
    } catch {
        return false
    }
}

/** ローカル Supabase 専用。本番では使わない。 */
const LOCAL_DEV_EMAIL = 'dev@localhost'
const LOCAL_DEV_PASSWORD = 'local-dev-password'

export function getDevAuthCredentials(
    supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
    email: string | undefined = process.env.DEV_AUTH_EMAIL,
    password: string | undefined = process.env.DEV_AUTH_PASSWORD,
): { email: string; password: string; canSignUp: boolean } | null {
    if (email && password) {
        return { email, password, canSignUp: false }
    }
    if (isLocalSupabaseUrl(supabaseUrl)) {
        return { email: LOCAL_DEV_EMAIL, password: LOCAL_DEV_PASSWORD, canSignUp: true }
    }
    return null
}
