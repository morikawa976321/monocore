import { describe, expect, it } from 'vitest'
import type { Json } from '@/src/types/database.types'
import { formatDeadlineLabel, parseNextActionLines, parseProgress } from './card'

describe('formatDeadlineLabel', () => {
    it('formats future, today, overdue, and null deadlines', () => {
        expect(formatDeadlineLabel('2026-09-01', '2026-08-05')).toBe('あと27日')
        expect(formatDeadlineLabel('2026-08-05', '2026-08-05')).toBe('今日')
        expect(formatDeadlineLabel('2026-08-02', '2026-08-05')).toBe('3日超過')
        expect(formatDeadlineLabel(null, '2026-08-05')).toBeNull()
    })
})

describe('parseNextActionLines', () => {
    it('parses checklist markers, trims, and drops blanks', () => {
        expect(parseNextActionLines('[x] 完了\r\n[ ] 未完了\n\n  メモ  ')).toEqual([
            { text: '完了', done: true },
            { text: '未完了', done: false },
            { text: 'メモ', done: false },
        ])
        expect(parseNextActionLines('')).toEqual([])
    })
})

describe('parseProgress', () => {
    it('parses text and string links; null for empty', () => {
        expect(parseProgress({})).toBeNull()
        expect(
            parseProgress({
                text: '最新報告',
                links: ['https://example.com/a', 10, 'https://example.com/b'],
            } as Json)
        ).toEqual({
            text: '最新報告',
            links: ['https://example.com/a', 'https://example.com/b'],
        })
    })
})
