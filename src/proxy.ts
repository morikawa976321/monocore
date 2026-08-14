import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isDevAuthBypassEnabled } from '@/src/lib/auth/dev-bypass'

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
    // DEV_AUTH_EMAIL / DEV_AUTH_PASSWORD があればそのユーザーで入る。
    if (!isAuthenticated && isDevAuthBypassEnabled()) {
        await tryDevPasswordSignIn(supabase)
        if (pathname.startsWith('/login')) {
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
    const email = process.env.DEV_AUTH_EMAIL
    const password = process.env.DEV_AUTH_PASSWORD
    if (!email || !password) return false
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return !error
}

export async function proxy(request: NextRequest) {
    return await updateSession(request)
}

/**
 * プロキシを適用する範囲を指定します。
 */
export const config = {
    matcher: [
        /*
         * 以下のパス以外の全ての画像や静的ファイルを除外してマッチさせます。
         * - _next/static (静的ファイル)
         * - _next/image (画像最適化)
         * - favicon.ico (ファビコン)
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
