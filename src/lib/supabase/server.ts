import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * サーバー側（Server Components, Server Actions, Route Handlers）で
 * Supabaseを使用するためのクライアントを作成します。
 */
export async function createClient() {
    const cookieStore = await cookies()

    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                // 全てのクッキーを取得する
                getAll() {
                    return cookieStore.getAll()
                },
                // クッキーをセットする
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        )
                    } catch {
                        // Server Componentから呼ばれた場合、クッキーのセットは制限されることがありますが、
                        // Middlewareによるセッション更新があるため無視して問題ありません。
                    }
                },
            },
        }
    )
}
