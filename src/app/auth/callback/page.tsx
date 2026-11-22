import { useEffect } from 'react'
import { LoadingIndicator } from '@/src/components/ui/LoadingIndicator'
import { navigate } from '@/src/lib/router/navigation'
import { createClient } from '@/src/lib/supabase/client'

/**
 * Magic Link クリック後のコールバック。
 * URL に含まれる認証コードをセッション(localStorage)に交換し、アプリのトップページへ移る。
 * code がない、または交換に失敗した場合は /login へエラー付きで移る。
 *
 * コードは 1 回しか使えない。Supabase クライアントは detectSessionInUrl: false にしてあり(client.ts)、
 * 交換はここの 1 か所だけで行う。StrictMode の二重実行や再描画で 2 回走らないよう、モジュールの変数で
 * ページの読み込みごとに 1 回に絞る。
 */
let exchange: Promise<boolean> | null = null

function exchangeOnce(): Promise<boolean> {
    exchange ??= (async () => {
        const code = new URLSearchParams(window.location.search).get('code')
        if (!code) return false
        const { error } = await createClient().auth.exchangeCodeForSession(code)
        return !error
    })()
    return exchange
}

export default function AuthCallbackPage() {
    useEffect(() => {
        let cancelled = false
        void exchangeOnce().then((ok) => {
            if (cancelled) return
            navigate(ok ? '/' : '/login?error=invalid_or_expired_link', { replace: true })
        })
        return () => {
            cancelled = true
        }
    }, [])

    return (
        <div className="flex items-center justify-center min-h-screen">
            <LoadingIndicator label="ログイン中" />
        </div>
    )
}
