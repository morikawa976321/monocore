import { describe, expect, it } from 'vitest'
import {
    buildRow,
    normalizeCards,
    validateCards,
} from './project-cards-payload.mjs'

/** 最小の妥当なカード。個別テストで一部だけ壊して使う。 */
function validCard(overrides = {}) {
    return {
        slug: 'sample-card',
        title: 'サンプル',
        status: 'active',
        deadline: null,
        ...overrides,
    }
}

describe('normalizeCards', () => {
    it('accepts array or { cards } wrapper; rejects anything else', () => {
        const cards = [validCard()]
        expect(normalizeCards(cards)).toEqual(cards)
        expect(normalizeCards({ cards })).toEqual(cards)
        expect(normalizeCards({ nope: [] })).toBeNull()
    })
})

describe('validateCards', () => {
    it('passes a well-formed batch', () => {
        expect(
            validateCards([
                validCard({ goal_slug: 'monodukuri' }),
                validCard({ slug: 'other', goal_slug: 'health' }),
            ])
        ).toEqual([])
    })

    it('rejects bad status, slug, deadline, and goal_slug', () => {
        expect(validateCards([validCard({ status: 'nonsense' })])[0]).toContain('"status"')
        expect(validateCards([validCard({ slug: '   ' })])[0]).toContain('index=0')
        expect(validateCards([validCard({ deadline: '2026/09/30' })])).toHaveLength(1)
        expect(validateCards([validCard({ goal_slug: 'unknown' })])[0]).toContain(
            '未知の goal_slug'
        )
        expect(validateCards([validCard({ goal_slug: null })])).toEqual([])
    })

    it('reports every bad card in the batch, not just the first', () => {
        const errors = validateCards([
            validCard(),
            validCard({ slug: 'bad-status', status: 'nonsense' }),
            validCard({ slug: '' }),
            'not-an-object',
        ])
        expect(errors.length).toBeGreaterThanOrEqual(3)
    })
})

describe('buildRow', () => {
    it('never emits undefined deadline and keeps only known columns', () => {
        const omitted = validCard()
        delete omitted.deadline
        const row = buildRow(omitted)
        expect(row.deadline).toBeNull()
        expect(Object.keys(row).sort()).toEqual(
            [
                'ai_next',
                'ai_recent',
                'deadline',
                'deadline_note',
                'decisions',
                'definition_of_done',
                'goal_slug',
                'slug',
                'sort_order',
                'status',
                'title',
                'your_turn',
            ].sort()
        )
    })

    it('fills defaults and drops non-string array entries', () => {
        const row = buildRow(validCard({ ai_next: ['ok', 42, null] }))
        expect(row).toMatchObject({
            goal_slug: null,
            your_turn: '',
            ai_recent: {},
            decisions: [],
            ai_next: ['ok'],
            sort_order: 0,
        })
    })
})
