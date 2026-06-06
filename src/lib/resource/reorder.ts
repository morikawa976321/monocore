import { arrayMove } from '@dnd-kit/sortable'

export type SortableListItem = { id: string; sort_order: number }

/**
 * DnD 完了後の ID 順序から sort_order を再採番した一覧を返す。
 */
export function applyReorderToList<T extends SortableListItem>(
    list: T[],
    orderedIds: string[]
): T[] {
    const byId = new Map(list.map((item) => [item.id, item]))
    return orderedIds
        .map((id) => byId.get(id))
        .filter((item): item is T => item !== undefined)
        .map((item, index) => ({ ...item, sort_order: index }))
}

/**
 * arrayMove 後の ID 配列を返す（UI 層の DnD ハンドラ用）。
 */
export function reorderIds(ids: string[], activeId: string, overId: string): string[] {
    const oldIndex = ids.indexOf(activeId)
    const newIndex = ids.indexOf(overId)
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return ids
    return arrayMove(ids, oldIndex, newIndex)
}
