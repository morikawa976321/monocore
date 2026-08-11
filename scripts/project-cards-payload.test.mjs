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
        // waiting_user / waiting_other は2026-08-11に waiting へ統合済み。
        // DBのCHECK制約から外れた値なので、投入前にここで弾く。
        expect(validateCards([validCard({ status: 'waiting_user' })])[0]).toContain('"status"')
        expect(validateCards([validCard({ status: 'waiting_other' })])[0]).toContain('"status"')
        expect(validateCards([validCard({ status: 'waiting' })])).toEqual([])
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
                'ai_recent',
                'deadline',
                'deadline_note',
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

    it('drops columns that no longer exist even if the input still carries them', () => {
        // 2026-08-11に decisions・ai_next を列ごと廃止した。古い project_cards.json が
        // 残っていても、これらが行に混ざると upsert が列不在で落ちる。
        const row = buildRow(validCard({ decisions: [{ id: 'd1' }], ai_next: ['なにか'] }))
        expect(row).not.toHaveProperty('decisions')
        expect(row).not.toHaveProperty('ai_next')
    })

    it('fills defaults for omitted optional fields', () => {
        const row = buildRow(validCard())
        expect(row).toMatchObject({
            goal_slug: null,
            your_turn: '',
            ai_recent: {},
            definition_of_done: '',
            deadline_note: null,
            sort_order: 0,
        })
    })
})
