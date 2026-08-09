import { describe, expect, it } from 'vitest'
import { matchesReportQuery, parseToc, tocForDisplay } from './toc'

describe('parseToc', () => {
    it('parses a well-formed toc array', () => {
        const toc = parseToc([
            { level: 1, text: 'タイトル', anchor: 'タイトル' },
            { level: 2, text: '見出し2', anchor: '見出し2' },
        ])
        expect(toc).toEqual([
            { level: 1, text: 'タイトル', anchor: 'タイトル' },
            { level: 2, text: '見出し2', anchor: '見出し2' },
        ])
    })

    it('returns an empty array for non-array input', () => {
        expect(parseToc(null)).toEqual([])
        expect(parseToc('string')).toEqual([])
        expect(parseToc({ level: 1 })).toEqual([])
    })

    it('drops individual malformed entries without discarding the rest', () => {
        const toc = parseToc([
            { level: 1, text: 'ok', anchor: 'ok' },
            { level: 'not-a-number', text: 'bad level', anchor: 'bad' },
            { level: 2, text: '', anchor: 'empty-text' },
            { level: 2, text: 'no anchor' },
            'not-an-object',
            { level: 7, text: 'out of range', anchor: 'oor' },
            { level: 0, text: 'out of range low', anchor: 'oor2' },
        ])
        expect(toc).toEqual([{ level: 1, text: 'ok', anchor: 'ok' }])
    })
})

describe('tocForDisplay', () => {
    it('keeps headings through ### and drops #### and deeper', () => {
        expect(
            tocForDisplay([
                { level: 1, text: 'h1', anchor: 'h1' },
                { level: 2, text: 'h2', anchor: 'h2' },
                { level: 3, text: 'h3', anchor: 'h3' },
                { level: 4, text: 'h4', anchor: 'h4' },
                { level: 5, text: 'h5', anchor: 'h5' },
                { level: 6, text: 'h6', anchor: 'h6' },
            ])
        ).toEqual([
            { level: 1, text: 'h1', anchor: 'h1' },
            { level: 2, text: 'h2', anchor: 'h2' },
            { level: 3, text: 'h3', anchor: 'h3' },
        ])
    })
})

describe('matchesReportQuery', () => {
    const toc = [
        { level: 1, text: 'はじめに', anchor: 'a' },
        { level: 2, text: 'Deep Dive Section', anchor: 'b' },
    ]

    it('matches everything for an empty or whitespace-only query', () => {
        expect(matchesReportQuery('', 'タイトル', toc)).toBe(true)
        expect(matchesReportQuery('   ', 'タイトル', toc)).toBe(true)
    })

    it('matches on title, case-insensitively', () => {
        expect(matchesReportQuery('タイトル', 'サンプルタイトルです', toc)).toBe(true)
        expect(matchesReportQuery('DEEP', 'サンプルタイトルです', toc)).toBe(true)
    })

    it('matches on toc heading text', () => {
        expect(matchesReportQuery('はじめに', 'サンプル', toc)).toBe(true)
        expect(matchesReportQuery('section', 'サンプル', toc)).toBe(true)
    })

    it('returns false when neither title nor toc matches', () => {
        expect(matchesReportQuery('存在しない語', 'サンプル', toc)).toBe(false)
    })
})
