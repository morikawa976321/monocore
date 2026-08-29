/**
 * project_cards 投入ペイロードの検証・整形（純関数のみ）。
 *
 * DBアクセスを含まないのは、「1件でも不正なら1行も書かない」という
 * 事故防止の要をテストで固定するため。過去に置換方式の投入経路へ空配列を
 * 渡して実データを消した事故があり、この境界は回帰させてはならない。
 */

import { format, isValid, parseISO } from 'date-fns'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * カード本文（progress.text / next_actions）の上限。
 * 規約は taskbox/README.md「カード本文の書式規約」の 目安200字・上限300字。
 *
 * 2026-08-07に散文の規約にしたが、2026-08-30に cad-migration の経過が4,392字
 * （上限の14.6倍）まで伸びているのが見つかった。日次のdrainが1行ずつ足すだけの
 * 経路なので、書き手側の自制では止まらない。engineがフックで規約を止めているのと
 * 同じ形で、機械判定できるぶんを投入の境界で止める。
 *
 * 数え方は規約どおりコードポイント単位（サロゲートペアも1文字）。
 */
export const MAX_CARD_TEXT_LENGTH = 300

/**
 * DB上のslug一覧のうち、JSONに存在しないもの（=delete対象）を返す。
 * 「同期＝集合の一致」の要そのもの。upsertだけだとJSONから消したカードが
 * DBに残り続け、板に出たままになる（2026-08-16にresearch-collectorで実際に起きた）。
 *
 * reports側(reports-payload.mjs)に同名・同内容の関数がある。共有モジュールへ
 * 括り出さないのは、2つの同期経路を独立に保つため（片方の都合で触った変更が
 * もう片方のdelete判定を黙って変える方が、3行の重複より危ない）。
 */
export function computeStaleSlugs(existingSlugs, localSlugs) {
    const local = new Set(localSlugs)
    return existingSlugs.filter((slug) => !local.has(slug))
}

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

        // 未指定(undefined)は null と同じ「期限なし」として扱う。
        if (card.deadline != null && !isValidDateString(card.deadline)) {
            errors.push(`Card ${tag}: field "deadline" must be null or yyyy-MM-dd`)
        }

        // 長すぎるカードは1行も書かずに落とす。切り詰めて通すと、本人が読む面では
        // 規約どおりに見えるのに JSON 側だけが伸び続け、違反が見えなくなる。
        for (const [field, text] of [
            ['progress.text', isPlainObject(card.progress) ? card.progress.text : undefined],
            ['next_actions', card.next_actions],
        ]) {
            if (typeof text !== 'string') continue
            const length = [...text].length
            if (length > MAX_CARD_TEXT_LENGTH) {
                errors.push(
                    `Card ${tag}: field "${field}" must be at most ` +
                        `${MAX_CARD_TEXT_LENGTH} characters (got ${length}). ` +
                        '古い経緯は畳んで結論だけ残すこと（一次ソースはengineのノート側にある）。'
                )
            }
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
        deadline: card.deadline ?? null,
        deadline_note: typeof card.deadline_note === 'string' ? card.deadline_note : null,
        // 2欄は主体（AI／本人）ではなく時間軸で切る（2026-08-12）。
        // progress = 経過（過去）、next_actions = 次の一手（未来）。
        progress: isPlainObject(card.progress) ? card.progress : {},
        next_actions: typeof card.next_actions === 'string' ? card.next_actions : '',
        priority: Number.isInteger(card.priority) ? card.priority : 0,
    }
}
