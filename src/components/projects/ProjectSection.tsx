import { ProjectCard } from '@/src/components/projects/ProjectCard'
import type { ProjectCardRow } from '@/src/lib/supabase/queries/project-cards'
import type { DecisionAnswerRow } from '@/src/lib/supabase/queries/project-card-answers'

type ProjectSectionProps = {
    title: string
    cards: ProjectCardRow[]
    today: string
    answers: Map<string, DecisionAnswerRow>
    onAnswered: (row: DecisionAnswerRow) => void
}

export function ProjectSection({ title, cards, today, answers, onAnswered }: ProjectSectionProps) {
    if (cards.length === 0) return null

    return (
        <section className="space-y-2 sm:space-y-4">
            <h2 className="px-2 sm:px-0 text-sm leading-6 text-neutral-700 dark:text-neutral-300">
                {title}
            </h2>
            <div className="space-y-2 sm:space-y-4">
                {cards.map((card) => (
                    <ProjectCard
                        key={card.slug}
                        card={card}
                        today={today}
                        answers={answers}
                        onAnswered={onAnswered}
                    />
                ))}
            </div>
        </section>
    )
}
