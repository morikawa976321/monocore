import type {
    DecisionAnswerRow,
    DecisionAnswerValue,
} from '@/src/lib/supabase/queries/project-card-answers'

function decisionAnswerKey(cardSlug: string, decisionId: string): string {
    return `${cardSlug}::${decisionId}`
}

export function latestAnswerByDecision(rows: DecisionAnswerRow[]): Map<string, DecisionAnswerRow> {
    const latestMap = new Map<string, DecisionAnswerRow>()
    for (const row of rows) {
        const key = decisionAnswerKey(row.card_slug, row.decision_id)
        const existing = latestMap.get(key)
        if (!existing) {
            latestMap.set(key, row)
            continue
        }

        if (Date.parse(row.answered_at) > Date.parse(existing.answered_at)) {
            latestMap.set(key, row)
        }
    }
    return latestMap
}

export function answerLabel(answer: DecisionAnswerValue): string {
    if (answer === 'accept_recommendation') return '推奨で確定'
    if (answer === 'alternative') return '別の選択'
    return '見送る'
}
