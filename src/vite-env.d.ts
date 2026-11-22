/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string
    readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
    // 開発サーバーでだけ読む。.env.local にだけ置く(src/lib/auth/dev-bypass.ts)。
    readonly VITE_DEV_AUTH_EMAIL?: string
    readonly VITE_DEV_AUTH_PASSWORD?: string
    readonly VITE_DEV_AUTH_BYPASS?: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
