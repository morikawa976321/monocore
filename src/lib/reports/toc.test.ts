import { describe, expect, it } from 'vitest'
import { matchesReportQuery, parseToc, tocForDisplay } from './toc'

describe('parseToc', () => {
    it('keeps well-formed entries and drops malformed ones', () => {
        expect(
            parseToc([
                { level: 1, text: 'ok', anchor: 'ok' },
                { level: 'not-a-number', text: 'bad', anchor: 'bad' },
                { level: 2, text: '', anchor: 'empty' },
                null,
            ])
        ).toEqual([{ level: 1, text: 'ok', anchor: 'ok' }])
        expect(parseToc(null)).toEqual([])
    })
})

describe('tocForDisplay', () => {
    it('keeps headings through ### and drops #### and deeper', () => {
        expect(
            tocForDisplay([
                { level: 1, text: 'h1', anchor: 'h1' },
                { level: 3, text: 'h3', anchor: 'h3' },
                { level: 4, text: 'h4', anchor: 'h4' },
            ])
        ).toEqual([
            { level: 1, text: 'h1', anchor: 'h1' },
            { level: 3, text: 'h3', anchor: 'h3' },
        ])
    })
})

describe('matchesReportQuery', () => {
    const toc = [
        { level: 1, text: 'はじめに', anchor: 'a' },
        { level: 2, text: 'Deep Dive Section', anchor: 'b' },
    ]

    it('matches title/toc case-insensitively; misses otherwise', () => {
        expect(matchesReportQuery('', 'タイトル', toc)).toBe(true)
        expect(matchesReportQuery('DEEP', 'サンプル', toc)).toBe(true)
        expect(matchesReportQuery('はじめに', 'サンプル', toc)).toBe(true)
        expect(matchesReportQuery('存在しない語', 'サンプル', toc)).toBe(false)
    })
})
