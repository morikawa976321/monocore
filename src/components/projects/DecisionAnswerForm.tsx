'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/src/components/ui/Button'
import { createClient } from '@/src/lib/supabase/client'
import {
    insertDecisionAnswer,
    type DecisionAnswerRow,
    type DecisionAnswerValue,
} from '@/src/lib/supabase/queries/project-card-answers'

type DecisionAnswerFormProps = {
    cardSlug: string
    decisionId: string
    recommendation: string
    existingAnswer: DecisionAnswerRow | null
    onAnswered: (row: DecisionAnswerRow) => void
}

export function DecisionAnswerForm({
    cardSlug,
    decisionId,
    recommendation,
    existingAnswer,
    onAnswered,
}: DecisionAnswerFormProps) {
    const supabase = useMemo(() => createClient(), [])
    const [note, setNote] = useState(existingAnswer?.note ?? '')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    async function handleAnswer(answer: DecisionAnswerValue) {
        setIsSubmitting(true)
        setErrorMessage(null)
        try {
            const trimmedNote = note.trim()
            const input = {
                card_slug: cardSlug,
                decision_id: decisionId,
                answer,
                note: trimmedNote.length > 0 ? trimmedNote : null,
            }

            const { data, error } = await insertDecisionAnswer(supabase, input)
            if (error || !data) {
                setErrorMessage('回答の保存に失敗しました。時間をおいて再試行してください。')
                return
            }

            onAnswered(data)
        } catch {
            setErrorMessage('回答の保存に失敗しました。時間をおいて再試行してください。')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1">
                <span className="text-sm text-neutral-800 dark:text-neutral-200">メモ（任意）</span>
                <input
                    type="text"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    disabled={isSubmitting}
                    className="w-full rounded-sm border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-900 outline-none transition-colors duration-150 ease-in-out placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-50 dark:placeholder:text-neutral-600 dark:focus:border-neutral-600 dark:focus:ring-neutral-600"
                    placeholder="必要なら補足を入力"
                />
            </label>

            <div className="flex flex-wrap gap-2">
                <Button
                    color="primary"
                    size="md"
                    className="w-full sm:w-auto"
                    disabled={isSubmitting}
                    onClick={() => void handleAnswer('accept_recommendation')}
                    // 推奨文は1文とは限らない（長文の判断がある）ので、
                    // ボタン面は固定ラベルにし、推奨の中身はカード側の「推奨:」行に任せる。
                    // スマホ幅でボタンが画面を埋めるのを避けるため。
                    title={recommendation}
                    aria-label={`推奨で確定: ${recommendation}`}
                >
                    推奨で確定
                </Button>
                <Button
                    color="secondary"
                    size="md"
                    className="w-full sm:w-auto"
                    disabled={isSubmitting}
                    onClick={() => void handleAnswer('alternative')}
                >
                    別の選択
                </Button>
                <Button
                    color="secondary"
                    size="md"
                    className="w-full sm:w-auto"
                    disabled={isSubmitting}
                    onClick={() => void handleAnswer('defer')}
                >
                    見送る
                </Button>
            </div>

            {errorMessage && (
                <p className="text-sm text-amber-600 dark:text-amber-400">{errorMessage}</p>
            )}
        </div>
    )
}
