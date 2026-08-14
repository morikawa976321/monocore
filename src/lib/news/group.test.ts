import { describe, expect, it } from 'vitest'
import type { ArticleListRow } from '@/src/lib/supabase/queries/articles'
import {
    ALL_SOURCES_KEY,
    buildSourceTabs,
    filterBySource,
    isSafeHttpUrl,
} from './group'

function article(source: string, link = `https://example.test/${source}`): ArticleListRow {
    return { link, source, title: 't', published: '2026-08-14T10:00:00+09:00', image_url: null }
}

describe('buildSourceTabs', () => {
    it('ALL を先頭に置き、総件数を持たせる', () => {
        const tabs = buildSourceTabs([article('A', '1'), article('B', '2'), article('A', '3')])
        expect(tabs[0]).toEqual({ key: ALL_SOURCES_KEY, label: 'ALL', count: 3 })
    })

    it('記事の並び順で最初に現れたソースから並べる', () => {
        const tabs = buildSourceTabs([article('B', '1'), article('A', '2'), article('B', '3')])
        expect(tabs.map((tab) => tab.label)).toEqual(['ALL', 'B', 'A'])
    })

    it('ソースごとの件数を数える', () => {
        const tabs = buildSourceTabs([article('A', '1'), article('B', '2'), article('A', '3')])
        expect(tabs.find((tab) => tab.key === 'A')?.count).toBe(2)
        expect(tabs.find((tab) => tab.key === 'B')?.count).toBe(1)
    })

    it('ソース名が空の記事は「その他」にまとめる', () => {
        const tabs = buildSourceTabs([article('', '1')])
        expect(tabs.map((tab) => tab.label)).toEqual(['ALL', 'その他'])
    })

    it('記事が無ければ ALL だけを返す', () => {
        expect(buildSourceTabs([])).toEqual([{ key: ALL_SOURCES_KEY, label: 'ALL', count: 0 }])
    })
})

describe('filterBySource', () => {
    const articles = [article('A', '1'), article('B', '2'), article('', '3')]

    it('ALL は全件を返す', () => {
        expect(filterBySource(articles, ALL_SOURCES_KEY)).toHaveLength(3)
    })

    it('指定ソースだけを返す', () => {
        expect(filterBySource(articles, 'A').map((a) => a.link)).toEqual(['1'])
    })

    it('「その他」はソース名が空の記事を拾う', () => {
        expect(filterBySource(articles, 'その他').map((a) => a.link)).toEqual(['3'])
    })
})

describe('isSafeHttpUrl', () => {
    it('http / https を通す', () => {
        expect(isSafeHttpUrl('http://example.test/a')).toBe(true)
        expect(isSafeHttpUrl('https://example.test/a')).toBe(true)
    })

    it('javascript: と data: を落とす', () => {
        // 記事のリンクと画像URLは外部サイト由来で、こちらで内容を検証していない。
        expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false)
        expect(isSafeHttpUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
    })

    it('空・null・相対パス・壊れた文字列を落とす', () => {
        expect(isSafeHttpUrl('')).toBe(false)
        expect(isSafeHttpUrl(null)).toBe(false)
        expect(isSafeHttpUrl('/relative/path')).toBe(false)
        expect(isSafeHttpUrl('not a url')).toBe(false)
    })
})
