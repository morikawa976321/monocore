import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { describe, expect, it } from 'vitest'
import { config } from '@/src/proxy'

// 認証ゲート(プロキシ)をどこまで外したかの境目。外し過ぎると未ログインでサーバー描画の中身が見え、
// 外し足りないとページ取得のたびに関数の起動(約 110ms)が乗る。Next.js 自身の matcher 解釈で判定する。
function matches(path: string): boolean {
    return unstable_doesMiddlewareMatch({ config, url: `http://localhost${path}` })
}

describe('proxy matcher', () => {
    it('クライアント描画だけの殻のページはプロキシを通さない', () => {
        for (const path of ['/', '/schedules', '/finance', '/news', '/reports', '/reports/some-slug']) {
            expect(matches(path), path).toBe(false)
        }
    })

    it('先読み(_rsc)も殻のページと同じ扱い', () => {
        expect(matches('/schedules?_rsc=abc')).toBe(false)
        expect(matches('/reports/some-slug?_rsc=abc')).toBe(false)
    })

    it('サーバーで描画するルートと認証まわりはプロキシを通す', () => {
        // /weather は地点をサーバーが HTML に入れる。外すと未ログインで地点が見える。
        for (const path of ['/weather', '/login', '/auth/callback']) {
            expect(matches(path), path).toBe(true)
        }
    })

    it('殻の名前で始まるだけの別のパスや、深い階層は通す(新しいルートは既定で門番を通る)', () => {
        for (const path of ['/schedules/x', '/finance/x', '/news/x', '/reports/a/b', '/schedulesx', '/newsletter', '/admin', '/unknown']) {
            expect(matches(path), path).toBe(true)
        }
    })

    it('静的ファイルと画像はプロキシを通さない', () => {
        for (const path of ['/_next/static/chunks/a.js', '/_next/image', '/favicon.ico', '/icon.png', '/a/b.svg']) {
            expect(matches(path), path).toBe(false)
        }
    })
})
