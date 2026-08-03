import type { ProjectCardRow } from '@/src/lib/supabase/queries/project-cards'
import {
    formatDeadlineLabel,
    parseAiNext,
    parseAiRecent,
    parseDecisions,
} from '@/src/lib/projects/card'

type ProjectCardProps = {
    card: ProjectCardRow
    today: string
}

export function ProjectCard({ card, today }: ProjectCardProps) {
    const deadlineLabel = formatDeadlineLabel(card.deadline, today)
    const aiRecent = parseAiRecent(card.ai_recent)
    const decisions = parseDecisions(card.decisions)
    const aiNext = parseAiNext(card.ai_next)

    return (
        <article className="rounded border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex flex-col gap-4">
                <header className="flex flex-col gap-2">
                    <h3 className="text-base font-medium text-neutral-900 dark:text-neutral-50">{card.title}</h3>
                    <p className="text-sm text-neutral-800 dark:text-neutral-200">{card.definition_of_done}</p>
                </header>

                {card.deadline && (
                    <section className="flex flex-col gap-2">
                        <h4 className="text-sm font-medium text-neutral-900 dark:text-neutral-50">期限</h4>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm text-neutral-900 dark:text-neutral-50">{card.deadline}</span>
                            {deadlineLabel && (
                                <span className="rounded-sm border border-amber-500 px-2 py-1 text-sm text-amber-600 dark:border-amber-400 dark:text-amber-400">
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
                        {decisions.map((decision) => (
                            <li
                                key={decision.id}
                                className="rounded-sm border border-neutral-200 bg-neutral-100 p-2 dark:border-neutral-800 dark:bg-neutral-800"
                            >
                                <p className="text-sm text-neutral-900 dark:text-neutral-50">{decision.question}</p>
                                <p className="text-sm text-neutral-800 dark:text-neutral-200">
                                    推奨: {decision.recommendation}
                                </p>
                                <p className="text-sm text-neutral-700 dark:text-neutral-300">
                                    提示 {decision.times_shown}回目
                                </p>
                            </li>
                        ))}
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
