import { describe, expect, it } from 'vitest'
import {
    ALLOWED_GOAL_SLUGS,
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
    it('accepts a bare array', () => {
        const cards = [validCard()]
        expect(normalizeCards(cards)).toEqual(cards)
    })

    it('accepts a { cards: [...] } wrapper', () => {
        const cards = [validCard()]
        expect(normalizeCards({ cards })).toEqual(cards)
    })

    it('returns null for anything else', () => {
        expect(normalizeCards({ nope: [] })).toBeNull()
        expect(normalizeCards('string')).toBeNull()
        expect(normalizeCards(null)).toBeNull()
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
        expect(ALLOWED_GOAL_SLUGS.size).toBe(5)
    })

    it('rejects an unknown status', () => {
        const errors = validateCards([validCard({ status: 'nonsense' })])
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('"status"')
    })

    it('rejects an empty slug and names the offending index', () => {
        const errors = validateCards([validCard({ slug: '   ' })])
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('index=0')
    })

    it('rejects a malformed deadline but allows null and omitted', () => {
        expect(validateCards([validCard({ deadline: '2026/09/30' })])).toHaveLength(1)
        expect(validateCards([validCard({ deadline: '2026-02-31' })])).toHaveLength(1)
        expect(validateCards([validCard({ deadline: null })])).toEqual([])
        const omitted = validCard()
        delete omitted.deadline
        expect(validateCards([omitted])).toEqual([])
    })

    it('rejects an unknown goal_slug and explains the display consequence', () => {
        const errors = validateCards([validCard({ goal_slug: 'unknown' })])
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('未知の goal_slug は画面で未分類になる')
    })

    it('rejects an empty goal_slug', () => {
        const errors = validateCards([validCard({ goal_slug: '' })])
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('"goal_slug"')
    })

    it('allows null and omitted goal_slug', () => {
        expect(validateCards([validCard({ goal_slug: null })])).toEqual([])
        expect(validateCards([validCard()])).toEqual([])
    })

    it('reports EVERY bad card in the batch, not just the first', () => {
        // 「1件でも不正なら1行も書かない」を成立させるため、
        // 検証は途中で打ち切らず全件を走査する必要がある。
        const errors = validateCards([
            validCard(),
            validCard({ slug: 'bad-status', status: 'nonsense' }),
            validCard({ slug: '' }),
        ])
        expect(errors.length).toBeGreaterThanOrEqual(2)
    })

    it('flags a non-object element instead of throwing', () => {
        expect(() => validateCards(['not-an-object'])).not.toThrow()
        expect(validateCards(['not-an-object'])).toHaveLength(1)
    })
})

describe('buildRow', () => {
    it('fills defaults for every optional field', () => {
        const row = buildRow(validCard())
        expect(row).toMatchObject({
            slug: 'sample-card',
            title: 'サンプル',
            status: 'active',
            deadline: null,
            deadline_note: null,
            definition_of_done: '',
            goal_slug: null,
            your_turn: '',
            ai_recent: {},
            decisions: [],
            ai_next: [],
            sort_order: 0,
        })
    })

    it('never emits an undefined deadline (would skip the column on upsert)', () => {
        const omitted = validCard()
        delete omitted.deadline
        expect(buildRow(omitted).deadline).toBeNull()
    })

    it('trims slug and title', () => {
        const row = buildRow(validCard({ slug: '  spaced  ', title: '  題  ' }))
        expect(row.slug).toBe('spaced')
        expect(row.title).toBe('題')
    })

    it('returns goal_slug', () => {
        const row = buildRow(validCard({ goal_slug: 'ai-collab' }))
        expect(row.goal_slug).toBe('ai-collab')
    })

    it('drops non-string entries from string array columns', () => {
        const row = buildRow(validCard({ ai_next: ['ok', 42, null] }))
        expect(row.ai_next).toEqual(['ok'])
    })

    it('produces only known project_cards columns', () => {
        // 列名のtypoは実行時まで落ちないので、キー集合そのものを固定する。
        expect(Object.keys(buildRow(validCard())).sort()).toEqual(
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
})
