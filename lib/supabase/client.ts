import { createBrowserClient } from '@supabase/ssr'

/**
 * クライアント（ブラウザ）側でSupabaseを使用するためのクライアントを作成します。
 * 'use client' を指定したコンポーネントで使用します。
 */
export function createClient() {
    return createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
}
