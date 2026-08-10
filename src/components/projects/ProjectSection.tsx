import { ProjectCard } from '@/src/components/projects/ProjectCard'
import type { ProjectCardRow } from '@/src/lib/supabase/queries/project-cards'
import type { ProjectNoteRow } from '@/src/lib/supabase/queries/project-notes'

type ProjectSectionProps = {
    title: string
    description?: string
    cards: ProjectCardRow[]
    today: string
    notesByCard: Map<string | null, ProjectNoteRow>
    onNoteSaved: (row: ProjectNoteRow) => void
    showWhenEmpty?: boolean
    tone?: 'default' | 'warning'
}

export function ProjectSection({
    title,
    description,
    cards,
    today,
    notesByCard,
    onNoteSaved,
    showWhenEmpty = false,
    tone = 'default',
}: ProjectSectionProps) {
    if (cards.length === 0 && !showWhenEmpty) return null

    return (
        <section
            className={`space-y-2 sm:space-y-4 ${
                tone === 'warning'
                    ? 'border-l-2 border-amber-500 pl-2 dark:border-amber-400 sm:pl-4'
                    : ''
            }`}
        >
            <div className="px-2 sm:px-0">
                <h2
                    className={`text-base leading-7 ${
                        tone === 'warning'
                            ? 'font-medium text-amber-600 dark:text-amber-400'
                            : 'text-neutral-700 dark:text-neutral-300'
                    }`}
                >
                    {title}
                </h2>
                {description && (
                    <p className="text-sm leading-6 text-neutral-800 dark:text-neutral-200">
                        {description}
                    </p>
                )}
            </div>
            {cards.length > 0 && (
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
            )}
        </section>
    )
}
