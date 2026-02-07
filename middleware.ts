import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                // リクエストから全クッキーを取得
                getAll() {
                    return request.cookies.getAll()
                },
                // 更新されたクッキーをレスポンスにセット
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
                    supabaseResponse = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    // これにより、期限切れが近いセッションを自動的にリフレッシュします（重要）
    await supabase.auth.getUser()

    return supabaseResponse
}

export async function middleware(request: NextRequest) {
    return await updateSession(request)
}

/**
 * ミドルウェアを適用する範囲を指定します。
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
