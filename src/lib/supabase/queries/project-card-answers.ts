import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database.types'

export type DecisionAnswerValue = 'accept_recommendation' | 'alternative' | 'defer'

export type DecisionAnswerRow = Database['public']['Tables']['project_card_decision_answers']['Row']

type InsertDecisionAnswerInput = {
    card_slug: string
    decision_id: string
    answer: DecisionAnswerValue
    note: string | null
}

export async function getDecisionAnswers(
    supabase: SupabaseClient<Database>
): Promise<{ data: DecisionAnswerRow[] | null; error: PostgrestError | null }> {
    const { data, error } = await supabase
        .from('project_card_decision_answers')
        .select('*')
        .order('answered_at', { ascending: false })
    return { data, error }
}

export async function insertDecisionAnswer(
    supabase: SupabaseClient<Database>,
    input: InsertDecisionAnswerInput
): Promise<{ data: DecisionAnswerRow | null; error: PostgrestError | null }> {
    const { data, error } = await supabase
        .from('project_card_decision_answers')
        .insert(input)
        .select('*')
        .single()
    return { data, error }
}
