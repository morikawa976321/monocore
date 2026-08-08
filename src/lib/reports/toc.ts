import type { Json } from '@/src/types/database.types'

export type TocEntry = {
    level: number
    text: string
    anchor: string
}

function isRecord(value: Json): value is { [key: string]: Json | undefined } {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * reports.toc(jsonb: [{level, text, anchor}, ...])をパースする。
 * DB由来でも型を信用せず、壊れた要素は個別に捨てる(1件の不正で目次全体を消さない)。
 */
export function parseToc(value: Json): TocEntry[] {
    if (!Array.isArray(value)) return []

    const parsed: TocEntry[] = []
    for (const item of value) {
        if (!isRecord(item)) continue

        const level = item.level
        const text = item.text
        const anchor = item.anchor

        if (typeof level !== 'number' || !Number.isInteger(level) || level < 1 || level > 6) continue
        if (typeof text !== 'string' || text.trim().length === 0) continue
        if (typeof anchor !== 'string' || anchor.trim().length === 0) continue

        parsed.push({ level, text, anchor })
    }

    return parsed
}

/**
 * 一覧の絞り込み。タイトルまたはtocの見出しテキストのいずれかに
 * queryが部分一致すればtrue(本文は検索対象にしない)。大文字小文字を区別しない。
 */
export function matchesReportQuery(query: string, title: string, toc: TocEntry[]): boolean {
    const needle = query.trim().toLowerCase()
    if (needle.length === 0) return true
    if (title.toLowerCase().includes(needle)) return true
    return toc.some((entry) => entry.text.toLowerCase().includes(needle))
}
