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
