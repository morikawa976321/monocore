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

        if (typeof id !== 'string' || id.trim().length === 0) continue
        if (typeof question !== 'string' || question.trim().length === 0) continue
        if (typeof recommendation !== 'string' || recommendation.trim().length === 0) continue
        if (typeof firstRaised !== 'string' || firstRaised.trim().length === 0) continue
        if (typeof timesShown !== 'number' || !Number.isInteger(timesShown) || timesShown < 0) continue
        if (!Array.isArray(blocks)) continue

        const parsedBlocks = blocks.filter(
            (block): block is string => typeof block === 'string' && block.trim().length > 0
        )

        parsed.push({
            id,
            question,
            recommendation,
            first_raised: firstRaised,
            times_shown: timesShown,
            blocks: parsedBlocks,
        })
    }

    return parsed
}

export function parseAiNext(value: Json): string[] {
    if (!Array.isArray(value)) return []
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}
