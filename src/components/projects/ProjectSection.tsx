import { ProjectCard } from '@/src/components/projects/ProjectCard'
import type { ProjectCardRow } from '@/src/lib/supabase/queries/project-cards'
import type { ProjectNoteRow } from '@/src/lib/supabase/queries/project-notes'

type ProjectSectionProps = {
    title: string
    cards: ProjectCardRow[]
    today: string
    notesByCard: Map<string | null, ProjectNoteRow>
    onNoteSaved: (row: ProjectNoteRow) => void
}

export function ProjectSection({
    title,
    cards,
    today,
    notesByCard,
    onNoteSaved,
}: ProjectSectionProps) {
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
                        latestNote={notesByCard.get(card.slug) ?? null}
                        onNoteSaved={onNoteSaved}
                    />
                ))}
            </div>
        </section>
    )
}
