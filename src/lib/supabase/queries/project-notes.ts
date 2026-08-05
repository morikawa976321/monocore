import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database.types'

export type ProjectNoteRow = Database['public']['Tables']['project_notes']['Row']

type InsertProjectNoteInput = {
    /** null は「板全体について」の記述を意味する。 */
    card_slug: string | null
    body: string
}

export async function getProjectNotes(
    supabase: SupabaseClient<Database>
): Promise<{ data: ProjectNoteRow[] | null; error: PostgrestError | null }> {
    const { data, error } = await supabase
        .from('project_notes')
        .select('*')
        .order('created_at', { ascending: false })
    return { data, error }
}

export async function insertProjectNote(
    supabase: SupabaseClient<Database>,
    input: InsertProjectNoteInput
): Promise<{ data: ProjectNoteRow | null; error: PostgrestError | null }> {
    const { data, error } = await supabase
        .from('project_notes')
        .insert(input)
        .select('*')
        .single()
    return { data, error }
}

/**
 * カードごとの最新1件を引く。null キーが板全体ぶん。
 * 追記専用テーブルなので「現在の内容」＝最新行という約束。
 */
export function latestNoteByCard(notes: ProjectNoteRow[]): Map<string | null, ProjectNoteRow> {
    const latest = new Map<string | null, ProjectNoteRow>()
    for (const note of notes) {
        const key = note.card_slug
        const current = latest.get(key)
        if (!current || note.created_at > current.created_at) {
            latest.set(key, note)
        }
    }
    return latest
}
