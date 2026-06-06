import { describe, expect, it } from 'vitest'
import { applyReorderToList, reorderIds } from './reorder'

describe('applyReorderToList', () => {
    const list = [
        { id: 'a', title: 'A', sort_order: 0 },
        { id: 'b', title: 'B', sort_order: 1 },
        { id: 'c', title: 'C', sort_order: 2 },
    ]

    it('reorders items and reassigns sort_order by index', () => {
        const result = applyReorderToList(list, ['c', 'a', 'b'])
        expect(result.map((r) => r.id)).toEqual(['c', 'a', 'b'])
        expect(result.map((r) => r.sort_order)).toEqual([0, 1, 2])
    })

    it('ignores unknown ids', () => {
        const result = applyReorderToList(list, ['b', 'unknown', 'a'])
        expect(result.map((r) => r.id)).toEqual(['b', 'a'])
        expect(result.map((r) => r.sort_order)).toEqual([0, 1])
    })
})

describe('reorderIds', () => {
    it('moves active id before over id', () => {
        const ids = ['a', 'b', 'c']
        expect(reorderIds(ids, 'c', 'a')).toEqual(['c', 'a', 'b'])
    })

    it('returns same array when ids are missing or equal', () => {
        const ids = ['a', 'b']
        expect(reorderIds(ids, 'a', 'a')).toEqual(['a', 'b'])
        expect(reorderIds(ids, 'x', 'a')).toEqual(['a', 'b'])
    })
})
