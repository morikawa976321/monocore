'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/src/lib/supabase/client'

/**
 * 未ログインのまま殻のページを開いたとき、/login へ送る門番(ブラウザ側)。
 *
 * 殻のページ(/ ・ /schedules ・ /finance ・ /news ・ /reports ・ /reports/<slug>)は src/proxy.ts の
 * matcher から外してあり、サーバーでは門番をしない。HTML にデータは無く、データは RLS で守られた
 * ブラウザからの直接取得なので、未ログインで殻が見えても読めるものは無い。ここで /login へ送る。
 *
 * - getSession は Cookie を読むだけで通信しない(アクセストークンの期限切れのときだけ更新の通信が出る。
 *   どのページもすぐ後に同じ更新を要るので、増える通信は無い)。
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
