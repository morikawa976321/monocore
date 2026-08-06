import { ProjectCard } from '@/src/components/projects/ProjectCard'
import { formatDeadlineLabel } from '@/src/lib/projects/card'
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
    collapseCards?: boolean
    tone?: 'default' | 'warning'
}

function CollapsedProjectCard({ card, today }: { card: ProjectCardRow; today: string }) {
    const deadlineLabel = formatDeadlineLabel(card.deadline, today)

    return (
        <article className="rounded bg-neutral-50 dark:bg-neutral-900 overflow-hidden border border-neutral-400 dark:border-neutral-600">
            <div className="flex items-center justify-between gap-2 px-2 sm:px-4 py-2 text-sm leading-6">
                <span className="min-w-0 truncate text-neutral-900 dark:text-neutral-50">
                    {card.title}
                </span>
                {deadlineLabel && (
                    <span className="shrink-0 px-1 py-0.5 rounded-sm border border-amber-500 dark:border-amber-400 text-amber-600 dark:text-amber-400 text-sm font-medium leading-none">
                        {deadlineLabel}
                    </span>
                )}
            </div>
        </article>
    )
}

export function ProjectSection({
    title,
    description,
    cards,
    today,
    notesByCard,
    onNoteSaved,
    showWhenEmpty = false,
    collapseCards = false,
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
                    className={`text-sm leading-6 ${
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
                    {cards.map((card) =>
                        collapseCards && card.collapsed ? (
                            <CollapsedProjectCard key={card.slug} card={card} today={today} />
                        ) : (
                            <ProjectCard
                                key={card.slug}
                                card={card}
                                today={today}
                                latestNote={notesByCard.get(card.slug) ?? null}
                                onNoteSaved={onNoteSaved}
                            />
                        )
                    )}
                </div>
            )}
        </section>
    )
}
