'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/src/lib/supabase/client'

/**
 * 未ログインのまま殻のページを開いたとき、/login へ送る門番(ブラウザ側)。
 *
 * 殻のページ(/ ・ /schedules ・ /finance ・ /news ・ /reports)は src/proxy.ts の matcher から外して
 * あり、サーバーでは門番をしない。HTML にデータは無く、データは RLS で守られたブラウザからの直接取得
 * なので、未ログインで殻が見えても読めるものは無い。ここで /login へ送る。
 * /reports/<slug> は外していない(localStorage の本文をここの確認より先に出すので、サーバーの門番に残した)。
 * 新しい殻でも、ブラウザに置いたデータを確認より先に出すなら、外さない。
 *
 * - getSession は通常は Cookie を読むだけで、アクセストークンが期限切れ間近・期限切れのときだけ更新の
 *   通信が出る。どのページもすぐ後に同じ更新を要るので、増える通信は無い。
 * - 通信の失敗(error)では送り返さない。電波が弱いだけの人をログアウト扱いにして、ログイン画面で
 *   往復させないため。ページ側の取得が失敗として出す。
 * - SIGNED_OUT は、更新トークンが失効したときと、別のタブでログアウトしたときに来る。
 */
export function AuthGate() {
    const pathname = usePathname()

    useEffect(() => {
        if (pathname.startsWith('/login')) return

        const supabase = createClient()
        const toLogin = () => window.location.replace('/login')
        let cancelled = false

        void supabase.auth.getSession().then(({ data, error }) => {
            if (!cancelled && !error && !data.session) toLogin()
        })
        const { data } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_OUT') toLogin()
        })

        return () => {
            cancelled = true
            data.subscription.unsubscribe()
        }
    }, [pathname])

    return null
}
