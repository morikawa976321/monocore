import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
    // tsconfig の paths("@/*" → ルート)と同じ。型だけの import は消えるので今まで要らなかったが、
    // proxy.test.ts は @/ で値を import する src/proxy.ts を読む。
    resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
    test: {
        globals: true,
        environment: 'node',
        // .claude/worktrees/ に置かれる別セッションの作業コピーまで拾うと、同じテストが古い版で重ねて走る。
        exclude: [...configDefaults.exclude, '.claude/**'],
    },
})
