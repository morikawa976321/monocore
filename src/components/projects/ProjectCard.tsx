'use client'

import { ChevronDown, ChevronRight } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '@/src/components/ui/Button'
import type { ProjectCardRow } from '@/src/lib/supabase/queries/project-cards'
import { formatDeadlineLabel, parseAiRecent, parseYourTurnLines } from '@/src/lib/projects/card'

type ProjectCardProps = {
    card: ProjectCardRow
    today: string
}

export function ProjectCard({ card, today }: ProjectCardProps) {
    const [isOpen, setIsOpen] = useState(false)
    const panelId = useId()
    const deadlineLabel = formatDeadlineLabel(card.deadline, today)
    const aiRecent = parseAiRecent(card.ai_recent)
    const yourTurnLines = parseYourTurnLines(card.your_turn)

    return (
        <div className="rounded border border-neutral-400 bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-900 overflow-hidden">
            <Button
                color="ghost"
                size="nav"
                onClick={() => setIsOpen((prev) => !prev)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className="justify-start leading-6 rounded-none text-neutral-900 dark:text-neutral-50"
            >
                <span className="flex w-full min-w-0 items-center justify-between gap-2">
                    <span className="min-w-0 truncate">{card.title}</span>
                    <span className="flex shrink-0 items-center gap-2">
                        {deadlineLabel && (
                            <span className="px-1 py-0.5 rounded-sm border border-amber-500 dark:border-amber-400 text-amber-600 dark:text-amber-400 text-sm font-medium leading-none">
                                {deadlineLabel}
                            </span>
                        )}
                        {isOpen ? (
                            <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
                        ) : (
                            <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                        )}
                    </span>
                </span>
            </Button>

            {isOpen && (
                <div
                    id={panelId}
                    className="flex flex-col gap-4 border-t border-neutral-200 p-1 sm:p-4 text-neutral-900 dark:border-neutral-800 dark:text-neutral-100"
                >
                    <p>{card.definition_of_done}</p>

                    {card.deadline && (
                        <section className="flex flex-col gap-2">
                            <h4 className="text-sm font-medium leading-6 text-neutral-700 dark:text-neutral-300">
                                期限
                            </h4>
                            <div className="flex flex-wrap items-center gap-2">
                                <span>{card.deadline}</span>
                                {deadlineLabel && (
                                    <span className="px-1 py-0.5 rounded-sm border border-amber-500 dark:border-amber-400 text-amber-600 dark:text-amber-400 text-sm font-medium leading-none">
                                        {deadlineLabel}
                                    </span>
                                )}
                            </div>
                            {card.deadline_note && (
                                <p className="text-neutral-700 dark:text-neutral-300">
                                    {card.deadline_note}
                                </p>
                            )}
                        </section>
                    )}

                    {aiRecent && (
                        <section className="flex flex-col gap-2">
                            <h4 className="text-sm font-medium leading-6 text-neutral-700 dark:text-neutral-300">
                                AIがやったこと
                            </h4>
                            <p>{aiRecent.text}</p>
                            {aiRecent.links.length > 0 && (
                                <ul className="flex flex-col gap-1">
                                    {aiRecent.links.map((link) => (
                                        <li key={link}>
                                            <a
                                                href={link}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="break-all text-amber-600 transition-colors duration-150 ease-in-out hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-400"
                                            >
                                                {link}
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    )}

                    {yourTurnLines.length > 0 && (
                        <section className="flex flex-col gap-2">
                            <h4 className="text-sm font-medium leading-6 text-neutral-700 dark:text-neutral-300">
                                あなたの番
                            </h4>
                            <ul className="flex flex-col gap-1">
                                {yourTurnLines.map((line, index) => (
                                    <li
                                        key={`${card.slug}-your-turn-${index}`}
                                        className={`flex gap-2 ${
                                            line.done
                                                ? 'text-neutral-700 dark:text-neutral-300'
                                                : 'text-neutral-900 dark:text-neutral-100'
                                        }`}
                                    >
                                        <span aria-hidden="true">{line.done ? '✓' : '☐'}</span>
                                        <span>{line.text}</span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                </div>
            )}
        </div>
    )
}
