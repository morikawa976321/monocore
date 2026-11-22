import { useEffect } from 'react'
import { createClient } from '@/src/lib/supabase/client'
import { clearReportCache } from '@/src/lib/reports/cache'
import { navigate, usePathname } from '@/src/lib/router/navigation'
import { clearWeatherCache } from '@/src/lib/weather/cache'

/**
 * 未ログインのまま開いたとき、/login へ送る門番(ブラウザ側。全画面を担う)。
 *
 * サーバーは静的ファイルを返すだけで門番をしない。HTML にデータは無く、データは RLS で守られたブラウザからの
 * 直接取得なので、未ログインで画面の枠が見えても読めるものは無い。ブラウザに置いたデータ(レポートの本文など)を
 * 確認より先に出す画面は、自分で getSession を確かめてから出す(src/app/reports/[slug]/page.tsx)。
 *
 * - getSession は通常は localStorage を読むだけで、アクセストークンが期限切れ間近・期限切れのときだけ更新の
 *   通信が出る。どのページもすぐ後に同じ更新を要るので、増える通信は無い。
 * - 通信の失敗(error)では送り返さない。電波が弱いだけの人をログアウト扱いにして、ログイン画面で
 *   往復させないため。ページ側の取得が失敗として出す。
 * - SIGNED_OUT は、更新トークンが失効したときと、別のタブでログアウトしたときに来る。ブラウザに置いた
 *   レポートの本文と天気は、ログインが外れたら残さない。
 * - ログイン済みで /login を開いたときはアプリへ戻す(誤着地の固定化を防ぐ)。
 * - /auth/callback は対象外。コードの交換が終わるまでセッションが無く、ここで /login へ送ると交換を中断する。
 * - 開発サーバーでは、セッションが無ければ自動でログインする(src/lib/auth/dev-login.ts)。ログイン前の状態で
 *   取得を始めた画面があるので、入れたら読み込み直す。入れなかったら /login を出して止める(往復しない)。
 */
export function AuthGate() {
    const pathname = usePathname()

    useEffect(() => {
        if (pathname.startsWith('/auth/callback')) return

        const onLoginPage = pathname.startsWith('/login')
        const supabase = createClient()
        let cancelled = false

        void (async () => {
            const { data, error } = await supabase.auth.getSession()
            if (cancelled || error) return
            if (data.session) {
                if (onLoginPage) navigate('/', { replace: true })
                return
            }

            if (import.meta.env.DEV) {
                const { signInForDev } = await import('@/src/lib/auth/dev-login')
                if (cancelled) return
                if (await signInForDev(supabase)) {
                    if (!cancelled) window.location.replace(onLoginPage ? '/' : window.location.href)
                    return
                }
                if (cancelled) return
            }
            if (!onLoginPage) window.location.replace('/login')
        })()

        const { data } = supabase.auth.onAuthStateChange((event) => {
            if (event !== 'SIGNED_OUT') return
            clearReportCache()
            clearWeatherCache()
            if (!onLoginPage) window.location.replace('/login')
        })

        return () => {
            cancelled = true
            data.subscription.unsubscribe()
        }
    }, [pathname])

    return null
}
