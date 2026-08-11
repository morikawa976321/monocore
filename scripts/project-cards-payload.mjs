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
    // トリガー待ち。誰が待たれているかで分けていた waiting_user / waiting_other は
    // 2026-08-11に統合した(実質のボトルネックは常に本人なので区別が行動を変えない)。
    'waiting',
    'dormant',
    // 完了。dormant(寝ている=再開しうる)と意味が違うので分けている。
    // upsertは行を消さないため、終わったカードはこの状態で板から下ろす。
    'done',
])

export const ALLOWED_GOAL_SLUGS = new Set([
    'monodukuri',
    'career',
    'health',
    'simple-life',
    'ai-collab',
])

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

        if (
            card.goal_slug !== undefined &&
            card.goal_slug !== null &&
            (typeof card.goal_slug !== 'string' || !ALLOWED_GOAL_SLUGS.has(card.goal_slug))
        ) {
            errors.push(
                `Card ${tag}: field "goal_slug" must be null or one of ` +
                    `${Array.from(ALLOWED_GOAL_SLUGS).join(', ')} ` +
                    `(未知の goal_slug は画面で未分類になるため投入を拒否します)`
            )
        }
    }

    return errors
}

/** 検証済みカードをテーブルの列そのままの行へ整形する。 */
export function buildRow(card) {
    return {
        slug: card.slug.trim(),
        title: card.title.trim(),
        definition_of_done:
            typeof card.definition_of_done === 'string' ? card.definition_of_done : '',
        status: card.status,
        goal_slug: card.goal_slug ?? null,
        deadline: card.deadline ?? null,
        deadline_note: typeof card.deadline_note === 'string' ? card.deadline_note : null,
        // 2欄は主体（AI／本人）ではなく時間軸で切る（2026-08-12）。
        // progress = 経過（過去）、next_actions = 次の一手（未来）。
        progress: isPlainObject(card.progress) ? card.progress : {},
        next_actions: typeof card.next_actions === 'string' ? card.next_actions : '',
        sort_order: Number.isInteger(card.sort_order) ? card.sort_order : 0,
    }
}
