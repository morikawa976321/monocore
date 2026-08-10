import { describe, expect, it } from 'vitest'
import { mergeNoteRows } from './day-notes'

describe('mergeNoteRows', () => {
    it('does not overwrite dirty days with server values', () => {
        const current = new Map([['2026-08-05', '編集中']])

        const result = mergeNoteRows(
            current,
            [{ day_key: '2026-08-05', body: 'サーバー値' }],
            new Set(['2026-08-05'])
        )

        expect(result.get('2026-08-05')).toBe('編集中')
    })

    it('updates non-dirty days from server values', () => {
        const current = new Map([['2026-08-05', '古い値']])

        const result = mergeNoteRows(
            current,
            [{ day_key: '2026-08-05', body: '新しい値' }],
            new Set()
        )

        expect(result.get('2026-08-05')).toBe('新しい値')
    })
})
