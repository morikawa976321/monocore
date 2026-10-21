import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        // .claude/worktrees/ に置かれる別セッションの作業コピーまで拾うと、同じテストが古い版で重ねて走る。
        exclude: [...configDefaults.exclude, '.claude/**'],
    },
})
