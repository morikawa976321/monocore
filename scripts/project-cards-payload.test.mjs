import { describe, expect, it } from 'vitest'
import {
    MAX_CARD_TEXT_LENGTH,
    buildRow,
    computeStaleSlugs,
    normalizeCards,
    validateCards,
} from './project-cards-payload.mjs'

/** 最小の妥当なカード。個別テストで一部だけ壊して使う。 */
function validCard(overrides = {}) {
    return {
        slug: 'sample-card',
        title: 'サンプル',
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

describe('computeStaleSlugs', () => {
    it('returns DB slugs that are absent from the JSON', () => {
        expect(computeStaleSlugs(['a', 'b', 'c'], ['a', 'c'])).toEqual(['b'])
        expect(computeStaleSlugs(['a', 'b'], ['a', 'b', 'c'])).toEqual([])
        expect(computeStaleSlugs(['a', 'b'], [])).toEqual(['a', 'b'])
    })

    it('accepts a Set as the local side (投入スクリプトが渡す形)', () => {
        expect(computeStaleSlugs(['a', 'b'], new Set(['a']))).toEqual(['b'])
    })
})

describe('validateCards（本文の長さ）', () => {
    it('rejects a progress body over the limit instead of letting it grow', () => {
        const errors = validateCards([
            validCard({ progress: { text: 'あ'.repeat(MAX_CARD_TEXT_LENGTH + 1) } }),
        ])
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('progress.text')
        expect(errors[0]).toContain(String(MAX_CARD_TEXT_LENGTH + 1))
    })

    it('rejects an over-long next_actions as well', () => {
        const errors = validateCards([
            validCard({ next_actions: 'あ'.repeat(MAX_CARD_TEXT_LENGTH + 1) }),
        ])
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('next_actions')
    })

    it('counts surrogate pairs as one character (規約の数え方に合わせる)', () => {
        // [...text].length で数える。text.length だと絵文字が2文字になり、
        // 規約どおりに書いたカードが理由なく弾かれる。
        const errors = validateCards([
            validCard({ next_actions: '🙂'.repeat(MAX_CARD_TEXT_LENGTH) }),
        ])
        expect(errors).toEqual([])
    })

    it('accepts a body exactly at the limit', () => {
        expect(
            validateCards([validCard({ progress: { text: 'あ'.repeat(MAX_CARD_TEXT_LENGTH) } })])
        ).toEqual([])
    })
})

describe('validateCards', () => {
    it('passes a well-formed batch', () => {
        expect(validateCards([validCard(), validCard({ slug: 'other' })])).toEqual([])
    })

    it('rejects bad slug and deadline', () => {
        expect(validateCards([validCard({ slug: '   ' })])[0]).toContain('index=0')
        expect(validateCards([validCard({ deadline: '2026/09/30' })])).toHaveLength(1)
    })

    it('reports every bad card in the batch, not just the first', () => {
        const errors = validateCards([
            validCard(),
            validCard({ slug: '' }),
            validCard({ deadline: '2026/09/30' }),
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
                'deadline',
                'deadline_note',
                'definition_of_done',
                'next_actions',
                'priority',
                'progress',
                'slug',
                'title',
            ].sort()
        )
    })

    it('drops columns that no longer exist even if the input still carries them', () => {
        // 2026-08-11に decisions・ai_next を列ごと廃止し、2026-08-12に ai_recent・your_turn を
        // progress・next_actions へ改名した。古い project_cards.json が残っていても、
        // 旧名が行に混ざると upsert が列不在で落ちる。
        const row = buildRow(
            validCard({
                decisions: [{ id: 'd1' }],
                ai_next: ['なにか'],
                ai_recent: { text: '旧欄' },
                your_turn: '旧欄',
            })
        )
        expect(row).not.toHaveProperty('decisions')
        expect(row).not.toHaveProperty('ai_next')
        expect(row).not.toHaveProperty('ai_recent')
        expect(row).not.toHaveProperty('your_turn')
    })

    it('fills defaults for omitted optional fields', () => {
        const row = buildRow(validCard())
        expect(row).toMatchObject({
            next_actions: '',
            progress: {},
            definition_of_done: '',
            deadline_note: null,
            priority: 0,
        })
    })
})
