import type { BlockedProject } from '@/src/lib/plan/blocked-projects';

type Props = {
    projects: BlockedProject[];
    /** 囲みの外枠・見出しの帯・本文の余白。ページの他のカードと揃えるため、ページ側の定数を受け取る。 */
    cardClassName: string;
    headerClassName: string;
    bodyClassName: string;
};

/** 本人の手で止まっているプロジェクトを1つにつき1枚のカードで並べる。付帯情報（待ち日数・返し方など）は持たない。 */
export function BlockedProjectCards({ projects, cardClassName, headerClassName, bodyClassName }: Props) {
    if (projects.length === 0) return null;
    return (
        <div className="grid gap-2 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
                <section key={p.name} className={cardClassName}>
                    <h2 className={headerClassName}>{p.name}</h2>
                    <ul className={`${bodyClassName} space-y-1 text-sm text-neutral-900 dark:text-neutral-100`}>
                        {p.tasks.map((t, i) => (
                            <li key={i}>{t}</li>
                        ))}
                    </ul>
                </section>
            ))}
        </div>
    );
}
