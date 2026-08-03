import { ProjectCard } from '@/src/components/projects/ProjectCard'
import type { ProjectCardRow } from '@/src/lib/supabase/queries/project-cards'

type ProjectSectionProps = {
    title: string
    cards: ProjectCardRow[]
    today: string
}

export function ProjectSection({ title, cards, today }: ProjectSectionProps) {
    if (cards.length === 0) return null

    return (
        <section className="flex flex-col gap-4">
            <h2 className="text-base font-medium text-neutral-900 dark:text-neutral-50">{title}</h2>
            <div className="flex flex-col gap-4">
                {cards.map((card) => (
                    <ProjectCard key={card.slug} card={card} today={today} />
                ))}
            </div>
        </section>
    )
}
