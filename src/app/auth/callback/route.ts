import { NextResponse } from 'next/server'
import { createClient } from '@/src/lib/supabase/server'

/**
 * Magic Link クリック後のコールバック。
 * URL に含まれる認証コードをセッション（Cookie）に交換し、
 * アプリのトップページにリダイレクトする。
 * code がない、または交換に失敗した場合は /login へエラー付きでリダイレクトする。
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const loginUrl = new URL('/login', request.url)
    const redirectTo = new URL('/', request.url)

    if (!code) {
        loginUrl.searchParams.set('error', 'invalid_or_expired_link')
        return NextResponse.redirect(loginUrl)
    }

    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
        loginUrl.searchParams.set('error', 'invalid_or_expired_link')
        return NextResponse.redirect(loginUrl)
    }

    return NextResponse.redirect(redirectTo)
}
