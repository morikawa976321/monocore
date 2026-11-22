/**
 * `npm run dev` のときだけログインゲートを外す(AuthGate が開発用に自動ログインする)。
 * 本番ビルドでは import.meta.env.DEV が false になり、この判定を呼ぶ側の分岐ごと取り除かれる。
 * ログイン画面を確認したいときは .env.local に VITE_DEV_AUTH_BYPASS=0。
 */
export function isDevAuthBypassEnabled(
    mode: string | undefined = import.meta.env.MODE,
    flag: string | undefined = import.meta.env.VITE_DEV_AUTH_BYPASS,
): boolean {
    if (mode !== 'development') return false
    if (flag === '0' || flag === 'false') return false
    return true
}

export function isLocalSupabaseUrl(url: string | undefined = import.meta.env.VITE_SUPABASE_URL): boolean {
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
    supabaseUrl: string | undefined = import.meta.env.VITE_SUPABASE_URL,
    email: string | undefined = import.meta.env.VITE_DEV_AUTH_EMAIL,
    password: string | undefined = import.meta.env.VITE_DEV_AUTH_PASSWORD,
): { email: string; password: string; canSignUp: boolean } | null {
    if (email && password) {
        return { email, password, canSignUp: false }
    }
    if (isLocalSupabaseUrl(supabaseUrl)) {
        return { email: LOCAL_DEV_EMAIL, password: LOCAL_DEV_PASSWORD, canSignUp: true }
    }
    return null
}
