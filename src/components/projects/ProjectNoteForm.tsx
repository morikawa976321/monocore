'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/src/components/ui/Button'
import { Textarea } from '@/src/components/ui/Textarea'
import { createClient } from '@/src/lib/supabase/client'
import {
    insertProjectNote,
    type ProjectNoteRow,
} from '@/src/lib/supabase/queries/project-notes'

type ProjectNoteFormProps = {
    cardSlug: string
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

    // 回収済み(consumed_at あり)の記述は欄に残さない。drainが読み取ってカードへ反映した時点で、
    // その文章は「入力待ちの内容」ではなく履歴になるため。次に書くとき前回の文を消す手間が要らない。
    // 基準に card.updated_at を使わないのは、カードが無関係な理由（engineの別の差分など）でも
    // 更新されるからで、それで未回収の記述を消すと入力が失われる。
    const pendingNote = latestNote && !latestNote.consumed_at ? latestNote : null
    const consumedNote = latestNote && latestNote.consumed_at ? latestNote : null

    const [body, setBody] = useState(pendingNote?.body ?? '')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    // 別セッションやdrainの更新でDB側が変わったら、未編集の欄は追従させる。
    useEffect(() => {
        setBody(pendingNote?.body ?? '')
    }, [pendingNote?.id, pendingNote?.body])

    const trimmed = body.trim()
    const isUnchanged = trimmed === (pendingNote?.body ?? '').trim()

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
            {/* 回収済みの記述は読み取り専用で残す。欄からは消えるが、
                何を書いてdrainが何を受け取ったかは画面上で追える。 */}
            {consumedNote && (
                <div className="rounded-sm border border-neutral-200 bg-neutral-100 p-2 text-sm text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                    <p className="whitespace-pre-wrap">{consumedNote.body}</p>
                    <p>↑ {formatSavedAt(consumedNote.created_at)} に書いた内容（反映済み）</p>
                </div>
            )}

            <label className="flex flex-col gap-1">
                <span className="text-sm font-medium leading-6 text-neutral-700 dark:text-neutral-300">
                    {label}
                </span>
                <Textarea
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    disabled={isSubmitting}
                    rows={3}
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
                {pendingNote ? (
                    <span className="text-sm text-neutral-700 dark:text-neutral-300">
                        保存済み・未回収（{formatSavedAt(pendingNote.created_at)}）
                    </span>
                ) : consumedNote ? (
                    <span className="text-sm text-neutral-700 dark:text-neutral-300">
                        前回分は反映済み・新しく書けます
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
