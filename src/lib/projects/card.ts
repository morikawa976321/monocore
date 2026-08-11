import { differenceInCalendarDays, parseISO } from 'date-fns'
import type { Json } from '@/src/types/database.types'

// カードの2欄は主体（AI／本人）ではなく時間軸で切る（2026-08-12）。
// progress = 経過（過去）／ next_actions = 次の一手（未来）。
type Progress = {
    text: string
    links: string[]
}

export type NextActionLine = {
    text: string
    done: boolean
}

function isRecord(value: Json): value is { [key: string]: Json | undefined } {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function daysUntil(deadline: string, today: string): number {
    return differenceInCalendarDays(parseISO(deadline), parseISO(today))
}

export function formatDeadlineLabel(deadline: string | null, today: string): string | null {
    if (deadline === null) return null
    const remainingDays = daysUntil(deadline, today)
    if (Number.isNaN(remainingDays)) return null
    if (remainingDays > 0) return `あと${remainingDays}日`
    if (remainingDays === 0) return '今日'
    return `${Math.abs(remainingDays)}日超過`
}

export function parseNextActionLines(value: string): NextActionLine[] {
    return value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => {
            const doneMatch = line.match(/^\[\s*[xX]\s*\]\s*(.*)$/)
            if (doneMatch) {
                return { text: doneMatch[1].trim(), done: true }
            }

            const pendingMatch = line.match(/^\[\s+\]\s*(.*)$/)
            if (pendingMatch) {
                return { text: pendingMatch[1].trim(), done: false }
            }

            return { text: line, done: false }
        })
}

export function parseProgress(value: Json): Progress | null {
    if (!isRecord(value)) return null
    const text = value.text
    if (typeof text !== 'string' || text.trim().length === 0) return null

    const links = Array.isArray(value.links)
        ? value.links.filter((link): link is string => typeof link === 'string' && link.trim().length > 0)
        : []

    return {
        text: text.trim(),
        links,
    }
}
