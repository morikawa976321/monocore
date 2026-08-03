import { describe, expect, it } from 'vitest'
import {
    answerLabel,
    latestAnswerByDecision,
} from './answers'
import type { DecisionAnswerRow } from '@/src/lib/supabase/queries/project-card-answers'

function createRow(overrides: Partial<DecisionAnswerRow>): DecisionAnswerRow {
    return {
        id: 'row-1',
        card_slug: 'card-a',
        decision_id: 'decision-1',
        answer: 'accept_recommendation',
        note: null,
        answered_at: '2026-08-04T00:00:00.000Z',
        consumed_at: null,
        ...overrides,
    }
}

describe('latestAnswerByDecision', () => {
    it('keeps the newest answer for the same decision regardless of array order', () => {
        const older = createRow({
            id: 'older',
            answered_at: '2026-08-03T10:00:00.000Z',
            note: 'older',
        })
        const newer = createRow({
            id: 'newer',
            answered_at: '2026-08-03T11:00:00.000Z',
            note: 'newer',
        })

        const forward = latestAnswerByDecision([older, newer])
        const reverse = latestAnswerByDecision([newer, older])

        expect(forward.get('card-a::decision-1')?.id).toBe('newer')
        expect(reverse.get('card-a::decision-1')?.id).toBe('newer')
    })

    it('does not collide when different cards share the same decision id', () => {
        const cardA = createRow({
            id: 'card-a-answer',
            card_slug: 'card-a',
            decision_id: 'shared-decision',
        })
        const cardB = createRow({
            id: 'card-b-answer',
            card_slug: 'card-b',
            decision_id: 'shared-decision',
        })

        const result = latestAnswerByDecision([cardA, cardB])

        expect(result.get('card-a::shared-decision')?.id).toBe('card-a-answer')
        expect(result.get('card-b::shared-decision')?.id).toBe('card-b-answer')
        expect(result.size).toBe(2)
    })

    it('returns an empty map for empty input', () => {
        const result = latestAnswerByDecision([])
        expect(result.size).toBe(0)
    })
})

describe('answerLabel', () => {
    it('returns Japanese label for accept_recommendation', () => {
        expect(answerLabel('accept_recommendation')).toBe('推奨で確定')
    })

    it('returns Japanese label for alternative', () => {
        expect(answerLabel('alternative')).toBe('別の選択')
    })

    it('returns Japanese label for defer', () => {
        expect(answerLabel('defer')).toBe('見送る')
    })
})
