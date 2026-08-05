'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/src/components/ui/Button'
import { createClient } from '@/src/lib/supabase/client'
import {
    insertProjectNote,
    type ProjectNoteRow,
} from '@/src/lib/supabase/queries/project-notes'

type ProjectNoteFormProps = {
    /** null は「板全体について」の欄。 */
    cardSlug: string | null
    label: string
    placeholder: string
    latestNote: ProjectNoteRow | null
    onSaved: (row: ProjectNoteRow) => void
}

function formatSavedAt(timestamp: string): string {
    const date = new Date(timestamp)
    if (Number.isNaN(date.getTime())) return timestamp
    return date.toLocaleString('ja-JP')
}

export function ProjectNoteForm({
    cardSlug,
    label,
    placeholder,
    latestNote,
    onSaved,
}: ProjectNoteFormProps) {
    const supabase = useMemo(() => createClient(), [])
    const [body, setBody] = useState(latestNote?.body ?? '')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    // 別セッションやdrainの更新でDB側が変わったら、未編集の欄は追従させる。
    useEffect(() => {
        setBody(latestNote?.body ?? '')
    }, [latestNote?.id, latestNote?.body])

    const trimmed = body.trim()
    const isUnchanged = trimmed === (latestNote?.body ?? '').trim()

    async function handleSave() {
        if (trimmed.length === 0 || isUnchanged) return
        setIsSubmitting(true)
        setErrorMessage(null)
        try {
            const { data, error } = await insertProjectNote(supabase, {
                card_slug: cardSlug,
                body: trimmed,
            })
            if (error || !data) {
                setErrorMessage('保存に失敗しました。時間をおいて再試行してください。')
                return
            }
            onSaved(data)
        } catch {
            setErrorMessage('保存に失敗しました。時間をおいて再試行してください。')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1">
                <span className="text-sm font-medium leading-6 text-neutral-700 dark:text-neutral-300">
                    {label}
                </span>
                <textarea
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    disabled={isSubmitting}
                    rows={3}
                    className="w-full rounded-sm border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-900 outline-none transition-colors duration-150 ease-in-out placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-50 dark:placeholder:text-neutral-600 dark:focus:border-neutral-600 dark:focus:ring-neutral-600"
                    placeholder={placeholder}
                />
            </label>

            <div className="flex flex-wrap items-center gap-2">
                <Button
                    color="primary"
                    size="md"
                    className="w-full sm:w-auto"
                    disabled={isSubmitting || trimmed.length === 0 || isUnchanged}
                    onClick={() => void handleSave()}
                >
                    保存
                </Button>
                {/* 保存済みの内容がどれかを画面上で明示する。追記専用なので
                    「修正」は新しい行の追加になり、ここの表示が最新へ入れ替わる。 */}
                {latestNote ? (
                    <span className="text-sm text-neutral-700 dark:text-neutral-300">
                        保存済み（{formatSavedAt(latestNote.created_at)}
                        {latestNote.consumed_at ? '・回収済み' : '・未回収'}）
                    </span>
                ) : (
                    <span className="text-sm text-neutral-700 dark:text-neutral-300">未保存</span>
                )}
            </div>

            {errorMessage && (
                <p className="text-sm text-amber-600 dark:text-amber-400">{errorMessage}</p>
            )}
        </div>
    )
}
