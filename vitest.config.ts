import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
    // .env.local を読まない。読むと、開発者の VITE_* の値(ローカル Supabase の URL や開発用のログイン情報)が
    // import.meta.env に入り、それを既定値に使う関数(src/lib/auth/dev-bypass.ts)のテストが環境で変わる。
    envDir: false,
    // tsconfig の paths("@/*" → ルート)と同じ(vite.config.ts にも同じものを置いている)。
    // 型だけの import は消えるので要らないが、値を @/ で import するテストのために置く。
    resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
    test: {
        globals: true,
        environment: 'node',
        // .claude/worktrees/ に置かれる別セッションの作業コピーまで拾うと、同じテストが古い版で重ねて走る。
        exclude: [...configDefaults.exclude, '.claude/**'],
    },
})
