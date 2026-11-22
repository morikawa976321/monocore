import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getDevAuthCredentials, isDevAuthBypassEnabled } from '@/src/lib/auth/dev-bypass'

/**
 * セッション情報を最新状態に更新するための処理です。
 * クッキー経由で認証状態を同期します。
 */
export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet, headers) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
                    supabaseResponse = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                    Object.entries(headers).forEach(([key, value]) =>
                        supabaseResponse.headers.set(key, value)
                    )
                },
            },
        }
    )

    // Do not run code between createServerClient and supabase.auth.getClaims().
    // A simple mistake could make it very hard to debug issues with users being randomly logged out.
    const { data } = await supabase.auth.getClaims()
    const isAuthenticated = Boolean(data?.claims)

    const { pathname } = request.nextUrl

    function redirectWithSessionCookies(pathname: string) {
        const url = request.nextUrl.clone()
        url.pathname = pathname
        const redirectResponse = NextResponse.redirect(url)
        // リダイレクトでもセッション更新 Cookie を失わない
        for (const cookie of supabaseResponse.cookies.getAll()) {
            redirectResponse.cookies.set(cookie)
        }
        return redirectResponse
    }

    // 開発サーバーではログイン画面を出さない。RLS を通すため、
    // ローカル Supabase なら開発ユーザーで入り、それ以外は DEV_AUTH_* があれば入る。
    if (!isAuthenticated && isDevAuthBypassEnabled()) {
        const signedIn = await tryDevPasswordSignIn(supabase)
        // 入れたときだけ / へ送る。失敗したのに送ると、殻のページの AuthGate が /login へ戻して / と往復し続ける
        // (ローカル Supabase が止まっているときなど)。失敗したら /login を出して止める。
        if (signedIn && pathname.startsWith('/login')) {
            return redirectWithSessionCookies('/')
        }
        return supabaseResponse
    }

    // 未認証ユーザーを /login にリダイレクトする（/login, /auth/callback は除外）
    if (!isAuthenticated && !pathname.startsWith('/login') && !pathname.startsWith('/auth/callback')) {
        return redirectWithSessionCookies('/login')
    }

    // 認証済みで /login にいる場合はアプリへ戻す（誤着地の固定化を防ぐ）
    if (isAuthenticated && pathname.startsWith('/login')) {
        return redirectWithSessionCookies('/')
    }

    return supabaseResponse
}

async function tryDevPasswordSignIn(
    supabase: ReturnType<typeof createServerClient>,
): Promise<boolean> {
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

export async function proxy(request: NextRequest) {
    return await updateSession(request)
}

/**
 * プロキシを適用する範囲を指定します。
 *
 * 外すもの(下の正規表現の先読みに並べたもの):
 * - _next/static (静的ファイル)、_next/image (画像最適化)、favicon.ico、画像の拡張子
 * - クライアント描画だけの殻のページ: / ・ /schedules ・ /finance ・ /news ・ /reports。
 *   HTML にデータを持たず、データはブラウザから Supabase へ直接取りに行く(RLS)ので、サーバーで門番をする
 *   意味が無い。プロキシを通すと、ページ取得のたびに関数の起動が約 110ms 乗る(2026-11-22 本番の実測。
 *   Cookie なしでも同じ。docs/decisions.md「認証ゲートの一部をクライアントへ移した」)。未ログインは
 *   src/components/auth/AuthGate.tsx がブラウザ側で /login へ送る。
 *
 * 外さないもの: /weather(地点をサーバーが HTML に入れる)、/login、/auth/callback、未知のパス、
 * /reports/<slug>(開いたレポートの本文を localStorage から、AuthGate の確認より先に出す。外すと、セッションの
 * 無いブラウザに保存済みの本文が /login へ転送が終わるまで見える。サーバーの門番なら HTML を返す前に転送する)。
 * 殻だけを列挙して外す形にしてあるので、新しいルートは既定でプロキシを通る。殻のページを足したときだけ、
 * ここに足す(足し忘れても遅くなるだけで、門番は外れない)。境目は src/proxy.test.ts が検査する。
 */
export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|(?:schedules|finance|news|reports)?$).*)',
    ],
}
