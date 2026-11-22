import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
    plugins: [react(), tailwindcss()],
    // tsconfig の paths("@/*" → ルート)と同じ。vitest.config.ts にも同じものを置いている。
    resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
    // 開発サーバーは今までどおり 3000(.claude/launch.json と docs がこの番号を前提にしている)。
    server: { port: 3000, strictPort: true },
})
