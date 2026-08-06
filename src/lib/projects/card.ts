import { differenceInCalendarDays, parseISO } from 'date-fns'
import type { Json } from '@/src/types/database.types'

export type Decision = {
    id: string
    question: string
    recommendation: string
    first_raised: string
    times_shown: number
    blocks: string[]
}

type AiRecent = {
    text: string
    links: string[]
}

export type YourTurnLine = {
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

export function parseYourTurnLines(value: string): YourTurnLine[] {
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

export function parseAiRecent(value: Json): AiRecent | null {
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

export function parseDecisions(value: Json): Decision[] {
    if (!Array.isArray(value)) return []

    const parsed: Decision[] = []
    for (const item of value) {
        if (!isRecord(item)) continue

        const id = item.id
        const question = item.question
        const recommendation = item.recommendation
        const firstRaised = item.first_raised
        const timesShown = item.times_shown
        const blocks = item.blocks

        // 必須は「判断として成立するために画面へ出す3つ」だけに限る。
        // 補助情報(first_raised / times_shown / blocks)が欠けても判断ごと捨てない。
        // かつて blocks を必須にしていた結果、2026-08-04に全20件の判断が
        // 「判断」セクションごと消え、回答ボタンが1つも出ない状態で
        // DB投入もテストもQAも通過した。表示に使わない項目で描画を止めないこと。
        if (typeof id !== 'string' || id.trim().length === 0) continue
        if (typeof question !== 'string' || question.trim().length === 0) continue
        if (typeof recommendation !== 'string' || recommendation.trim().length === 0) continue

        const parsedFirstRaised = typeof firstRaised === 'string' ? firstRaised.trim() : ''
        const parsedTimesShown =
            typeof timesShown === 'number' && Number.isInteger(timesShown) && timesShown > 0
                ? timesShown
                : 0
        const parsedBlocks = Array.isArray(blocks)
            ? blocks.filter(
                  (block): block is string => typeof block === 'string' && block.trim().length > 0
              )
            : []

        parsed.push({
            id,
            question,
            recommendation,
            first_raised: parsedFirstRaised,
            times_shown: parsedTimesShown,
            blocks: parsedBlocks,
        })
    }

    return parsed
}

export function parseAiNext(value: Json): string[] {
    if (!Array.isArray(value)) return []
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}
