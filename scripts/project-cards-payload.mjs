/**
 * project_cards 投入ペイロードの検証・整形（純関数のみ）。
 *
 * DBアクセスを含まないのは、「1件でも不正なら1行も書かない」という
 * 事故防止の要をテストで固定するため。過去に置換方式の投入経路へ空配列を
 * 渡して実データを消した事故があり、この境界は回帰させてはならない。
 */

import { format, isValid, parseISO } from 'date-fns'

export const ALLOWED_STATUSES = new Set([
    'active',
    'waiting_user',
    'waiting_other',
    'dormant',
    // 完了。dormant(寝ている=再開しうる)と意味が違うので分けている。
    // upsertは行を消さないため、終わったカードはこの状態で板から下ろす。
    'done',
])

/**
 * 画面側 parseDecisions が判断を採用する条件と同じ必須項目。
 * ここを緩めると「DBには入ったのに画面に出ない」判断が生まれる。
 * 2026-08-04にその状態が実際に起き、20件すべての判断と回答ボタンが消えた。
 * 生成側と表示側の契約は必ず一致させること。
 */
const DECISION_REQUIRED_FIELDS = ['id', 'question', 'recommendation']

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isValidDateString(value) {
    if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false
    const parsed = parseISO(value)
    if (!isValid(parsed)) return false
    return format(parsed, 'yyyy-MM-dd') === value
}

/** 配列そのもの、または {cards: [...]} を受け付ける。どちらでもなければ null。 */
export function normalizeCards(payload) {
    if (Array.isArray(payload)) return payload
    if (isPlainObject(payload) && Array.isArray(payload.cards)) return payload.cards
    return null
}

function cardTag(card, index) {
    const slug = isPlainObject(card) && typeof card.slug === 'string' ? card.slug.trim() : ''
    if (slug.length > 0) return `slug="${slug}" (index=${index})`
    return `index=${index}`
}

/** 全件を検証してエラー文字列の配列を返す。空配列なら投入してよい。 */
export function validateCards(cards) {
    const errors = []

    for (let index = 0; index < cards.length; index += 1) {
        const card = cards[index]
        if (!isPlainObject(card)) {
            errors.push(`Card index=${index}: card must be an object`)
            continue
        }

        const tag = cardTag(card, index)
        if (typeof card.slug !== 'string' || card.slug.trim().length === 0) {
            errors.push(`Card ${tag}: field "slug" must be a non-empty string`)
        }

        if (typeof card.title !== 'string' || card.title.trim().length === 0) {
            errors.push(`Card ${tag}: field "title" must be a non-empty string`)
        }

        if (typeof card.status !== 'string' || !ALLOWED_STATUSES.has(card.status)) {
            errors.push(
                `Card ${tag}: field "status" must be one of ${Array.from(ALLOWED_STATUSES).join(', ')}`
            )
        }

        // 未指定(undefined)は null と同じ「期限なし」として扱う。
        if (card.deadline != null && !isValidDateString(card.deadline)) {
            errors.push(`Card ${tag}: field "deadline" must be null or yyyy-MM-dd`)
        }

        errors.push(...validateDecisions(card.decisions, tag))
    }

    return errors
}

/**
 * 判断が画面に出る形になっているかを投入前に弾く。
 * 「DBには入ったが画面には出ない」を沈黙させないための境界。
 */
export function validateDecisions(decisions, tag) {
    const errors = []
    if (decisions == null) return errors
    if (!Array.isArray(decisions)) {
        errors.push(`Card ${tag}: field "decisions" must be an array`)
        return errors
    }

    const seenIds = new Set()
    for (let index = 0; index < decisions.length; index += 1) {
        const decision = decisions[index]
        if (!isPlainObject(decision)) {
            errors.push(`Card ${tag}: decisions[${index}] must be an object`)
            continue
        }

        for (const field of DECISION_REQUIRED_FIELDS) {
            const value = decision[field]
            if (typeof value !== 'string' || value.trim().length === 0) {
                errors.push(
                    `Card ${tag}: decisions[${index}].${field} must be a non-empty string ` +
                        `(欠けると画面に出ないまま投入が通ってしまう)`
                )
            }
        }

        // 回答は (card_slug, decision_id) で紐づくため、カード内で重複すると
        // 別々の判断への回答が同じ1件として扱われる。
        const id = typeof decision.id === 'string' ? decision.id.trim() : ''
        if (id.length > 0) {
            if (seenIds.has(id)) {
                errors.push(`Card ${tag}: decisions[${index}].id "${id}" is duplicated`)
            }
            seenIds.add(id)
        }
    }

    return errors
}

function toStringArray(value) {
    if (!Array.isArray(value)) return []
    return value.filter((item) => typeof item === 'string')
}

/** 検証済みカードをテーブルの列そのままの行へ整形する。 */
export function buildRow(card) {
    return {
        slug: card.slug.trim(),
        title: card.title.trim(),
        definition_of_done:
            typeof card.definition_of_done === 'string' ? card.definition_of_done : '',
        status: card.status,
        deadline: card.deadline ?? null,
        deadline_note: typeof card.deadline_note === 'string' ? card.deadline_note : null,
        ai_recent: isPlainObject(card.ai_recent) ? card.ai_recent : {},
        your_turn: typeof card.your_turn === 'string' ? card.your_turn : '',
        decisions: Array.isArray(card.decisions) ? card.decisions : [],
        ai_next: toStringArray(card.ai_next),
        sources: toStringArray(card.sources),
        sort_order: Number.isInteger(card.sort_order) ? card.sort_order : 0,
    }
}
