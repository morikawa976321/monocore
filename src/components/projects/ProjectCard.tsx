import { DecisionAnswerForm } from '@/src/components/projects/DecisionAnswerForm'
import { answerLabel } from '@/src/lib/projects/answers'
import type { ProjectCardRow } from '@/src/lib/supabase/queries/project-cards'
import type {
    DecisionAnswerRow,
} from '@/src/lib/supabase/queries/project-card-answers'
import {
    formatDeadlineLabel,
    parseAiNext,
    parseAiRecent,
    parseDecisions,
} from '@/src/lib/projects/card'

type ProjectCardProps = {
    card: ProjectCardRow
    today: string
    answers: Map<string, DecisionAnswerRow>
    onAnswered: (row: DecisionAnswerRow) => void
}

function answerKey(cardSlug: string, decisionId: string): string {
    return `${cardSlug}::${decisionId}`
}

function formatAnsweredAt(timestamp: string): string {
    const date = new Date(timestamp)
    if (Number.isNaN(date.getTime())) return timestamp
    return date.toLocaleString('ja-JP')
}

export function ProjectCard({ card, today, answers, onAnswered }: ProjectCardProps) {
    const deadlineLabel = formatDeadlineLabel(card.deadline, today)
    const aiRecent = parseAiRecent(card.ai_recent)
    const decisions = parseDecisions(card.decisions)
    const aiNext = parseAiNext(card.ai_next)

    return (
        <article className="overflow-hidden rounded border border-neutral-400 bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-900">
            <header className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-2 py-2 text-sm leading-6 dark:border-neutral-800 dark:bg-neutral-800/50 sm:px-4">
                <h3 className="font-medium text-neutral-900 dark:text-neutral-50">{card.title}</h3>
            </header>

            <div className="flex flex-col gap-4 p-2 sm:p-4">
                <p className="text-sm text-neutral-800 dark:text-neutral-200">{card.definition_of_done}</p>

                {card.deadline && (
                    <section className="flex flex-col gap-2">
                        <h4 className="text-sm font-medium text-neutral-900 dark:text-neutral-50">期限</h4>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm text-neutral-900 dark:text-neutral-50">{card.deadline}</span>
                            {deadlineLabel && (
                                <span className="rounded-sm border border-amber-500 px-1 py-0.5 text-sm font-medium leading-none text-amber-600 dark:border-amber-400 dark:text-amber-400">
                                    {deadlineLabel}
                                </span>
                            )}
                        </div>
                        {card.deadline_note && (
                            <p className="text-sm text-neutral-700 dark:text-neutral-300">{card.deadline_note}</p>
                        )}
                    </section>
                )}

                {aiRecent && (
                    <section className="flex flex-col gap-2">
                        <h4 className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                            AIがやったこと
                        </h4>
                        <p className="text-sm text-neutral-800 dark:text-neutral-200">{aiRecent.text}</p>
                        {aiRecent.links.length > 0 && (
                            <ul className="flex flex-col gap-1">
                                {aiRecent.links.map((link) => (
                                    <li key={link}>
                                        <a
                                            href={link}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="break-all text-sm text-amber-600 transition-colors duration-150 ease-in-out hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-400"
                                        >
                                            {link}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                )}

                {card.your_turn.trim().length > 0 && (
                    <section className="flex flex-col gap-2">
                        <h4 className="text-sm font-medium text-neutral-900 dark:text-neutral-50">あなたの番</h4>
                        <p className="text-sm text-neutral-800 dark:text-neutral-200">{card.your_turn}</p>
                    </section>
                )}

                {decisions.length > 0 && (
                    <section className="flex flex-col gap-2">
                        <h4 className="text-sm font-medium text-neutral-900 dark:text-neutral-50">判断</h4>
                        <ul className="flex flex-col gap-2">
                            {decisions.map((decision) => {
                                const existingAnswer =
                                    answers.get(answerKey(card.slug, decision.id)) ?? null
                                const isAnswered = existingAnswer !== null

                                return (
                                    <li
                                        key={decision.id}
                                        className={
                                            isAnswered
                                                ? 'rounded-sm border border-neutral-200 bg-neutral-100 p-2 dark:border-neutral-700 dark:bg-neutral-800'
                                                : 'rounded-sm border border-amber-500 bg-neutral-50 p-2 dark:border-amber-400 dark:bg-neutral-900'
                                        }
                                    >
                                        <p className="text-sm text-neutral-900 dark:text-neutral-50">
                                            {decision.question}
                                        </p>
                                        <p className="text-sm text-neutral-800 dark:text-neutral-200">
                                            推奨: {decision.recommendation}
                                        </p>
                                        <p className="text-sm text-neutral-700 dark:text-neutral-300">
                                            提示 {decision.times_shown}回目
                                        </p>
                                        {isAnswered && existingAnswer ? (
                                            <p className="text-sm text-neutral-800 dark:text-neutral-200">
                                                回答済み: {answerLabel(existingAnswer.answer)}
                                                （{formatAnsweredAt(existingAnswer.answered_at)}）
                                            </p>
                                        ) : (
                                            <p className="text-sm text-amber-600 dark:text-amber-400">
                                                未回答: この判断への回答が必要です
                                            </p>
                                        )}
                                        <DecisionAnswerForm
                                            cardSlug={card.slug}
                                            decisionId={decision.id}
                                            recommendation={decision.recommendation}
                                            existingAnswer={existingAnswer}
                                            onAnswered={onAnswered}
                                        />
                                    </li>
                                )
                            })}
                        </ul>
                    </section>
                )}

                {aiNext.length > 0 && (
                    <section className="flex flex-col gap-2">
                        <h4 className="text-sm font-medium text-neutral-900 dark:text-neutral-50">AIの次の一手</h4>
                        <ul className="flex flex-col gap-1">
                            {aiNext.map((nextStep, index) => (
                                <li key={`${card.slug}-next-${index}`} className="text-sm text-neutral-800 dark:text-neutral-200">
                                    ・{nextStep}
                                </li>
                            ))}
                        </ul>
                    </section>
                )}
            </div>
        </article>
    )
}
