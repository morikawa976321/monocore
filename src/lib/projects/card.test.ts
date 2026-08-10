import { describe, expect, it } from 'vitest'
import type { Json } from '@/src/types/database.types'
import {
    formatDeadlineLabel,
    parseAiNext,
    parseAiRecent,
    parseDecisions,
    parseYourTurnLines,
} from './card'

describe('formatDeadlineLabel', () => {
    it('formats future, today, overdue, and null deadlines', () => {
        expect(formatDeadlineLabel('2026-09-01', '2026-08-05')).toBe('あと27日')
        expect(formatDeadlineLabel('2026-08-05', '2026-08-05')).toBe('今日')
        expect(formatDeadlineLabel('2026-08-02', '2026-08-05')).toBe('3日超過')
        expect(formatDeadlineLabel(null, '2026-08-05')).toBeNull()
    })
})

describe('parseYourTurnLines', () => {
    it('parses checklist markers, trims, and drops blanks', () => {
        expect(parseYourTurnLines('[x] 完了\r\n[ ] 未完了\n\n  メモ  ')).toEqual([
            { text: '完了', done: true },
            { text: '未完了', done: false },
            { text: 'メモ', done: false },
        ])
        expect(parseYourTurnLines('')).toEqual([])
    })
})

describe('parseAiRecent', () => {
    it('parses text and string links; null for empty', () => {
        expect(parseAiRecent({})).toBeNull()
        expect(
            parseAiRecent({
                text: '最新報告',
                links: ['https://example.com/a', 10, 'https://example.com/b'],
            } as Json)
        ).toEqual({
            text: '最新報告',
            links: ['https://example.com/a', 'https://example.com/b'],
        })
    })
})

describe('parseDecisions', () => {
    it('drops malformed elements and keeps valid decisions', () => {
        const input: Json = [
            {
                id: 'd1',
                question: '設計を分割するか？',
                recommendation: 'まず API を固定',
                first_raised: '2026-08-01',
                times_shown: 17,
                blocks: ['release'],
            },
            {
                id: 'd2',
                recommendation: 'missing question',
                first_raised: '2026-08-01',
                times_shown: 1,
                blocks: [],
            },
            {
                id: 'd3',
                question: 'times_shown が不正でも判断は残す',
                recommendation: '補助情報の欠落で判断を捨てない',
                times_shown: '2',
            },
            {
                id: 'd5',
                question: 'blocks が欠落していても判断は残す',
                recommendation: '2026-08-04に全20件が消えた実例のケース',
                first_raised: '2026-08-01',
                times_shown: 3,
            },
        ]

        expect(parseDecisions(input)).toEqual([
            {
                id: 'd1',
                question: '設計を分割するか？',
                recommendation: 'まず API を固定',
                first_raised: '2026-08-01',
                times_shown: 17,
                blocks: ['release'],
            },
            {
                id: 'd3',
                question: 'times_shown が不正でも判断は残す',
                recommendation: '補助情報の欠落で判断を捨てない',
                first_raised: '',
                times_shown: 0,
                blocks: [],
            },
            {
                id: 'd5',
                question: 'blocks が欠落していても判断は残す',
                recommendation: '2026-08-04に全20件が消えた実例のケース',
                first_raised: '2026-08-01',
                times_shown: 3,
                blocks: [],
            },
        ])
    })
})

describe('parseAiNext', () => {
    it('returns only string items', () => {
        const input: Json = ['API を分割', 1, null, 'テスト追加']
        expect(parseAiNext(input)).toEqual(['API を分割', 'テスト追加'])
    })
})
