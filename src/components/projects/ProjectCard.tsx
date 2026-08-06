import { ProjectNoteForm } from '@/src/components/projects/ProjectNoteForm'
import type { ProjectCardRow } from '@/src/lib/supabase/queries/project-cards'
import type { ProjectNoteRow } from '@/src/lib/supabase/queries/project-notes'
import {
    formatDeadlineLabel,
    parseAiNext,
    parseAiRecent,
    parseDecisions,
    parseYourTurnLines,
} from '@/src/lib/projects/card'

type ProjectCardProps = {
    card: ProjectCardRow
    today: string
    latestNote: ProjectNoteRow | null
    onNoteSaved: (row: ProjectNoteRow) => void
}

export function ProjectCard({ card, today, latestNote, onNoteSaved }: ProjectCardProps) {
    const deadlineLabel = formatDeadlineLabel(card.deadline, today)
    const aiRecent = parseAiRecent(card.ai_recent)
    const decisions = parseDecisions(card.decisions)
    const aiNext = parseAiNext(card.ai_next)
    const yourTurnLines = parseYourTurnLines(card.your_turn)

    return (
        <article className="rounded bg-neutral-50 dark:bg-neutral-900 overflow-hidden border border-neutral-400 dark:border-neutral-600">
            <header className="px-2 sm:px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50 text-sm leading-6 flex items-center justify-between">
                <div className="flex items-center text-neutral-700 dark:text-neutral-300">
                    <span>{card.title}</span>
                </div>
            </header>

            <div className="flex flex-col gap-4 p-1 sm:p-4 text-sm leading-6 sm:text-base sm:leading-7 text-neutral-900 dark:text-neutral-100">
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
                            <p className="text-neutral-700 dark:text-neutral-300">{card.deadline_note}</p>
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

                {/* 問いは表示だけ。推奨・選択肢・回答ボタンは置かない。
                    2026-08-05の実測で、20件の回答のうち12件が「別の選択」で、
                    問いの枠組み自体を否定する回答が複数あった（「そもそも衝突していない」
                    「製品決定が未完了。それが初手」等）。選択肢は答えの形を先に決めてしまい、
                    枠が外れているときに二度手間になる。入力は下の自由記述欄に一本化する。 */}
                {decisions.length > 0 && (
                    <section className="flex flex-col gap-2">
                        <h4 className="text-sm font-medium leading-6 text-neutral-700 dark:text-neutral-300">
                            AIが聞きたいこと
                        </h4>
                        <ul className="flex flex-col gap-2">
                            {decisions.map((decision) => (
                                <li
                                    key={decision.id}
                                    className="rounded-sm border border-amber-500 bg-neutral-50 p-2 dark:border-amber-400 dark:bg-neutral-900"
                                >
                                    <p>{decision.question}</p>
                                    {decision.times_shown > 0 && (
                                        <p className="text-neutral-700 dark:text-neutral-300">
                                            提示 {decision.times_shown}回目
                                        </p>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                {aiNext.length > 0 && (
                    <section className="flex flex-col gap-2">
                        <h4 className="text-sm font-medium leading-6 text-neutral-700 dark:text-neutral-300">
                            AIの次の一手
                        </h4>
                        <ul className="flex flex-col gap-1">
                            {aiNext.map((nextStep, index) => (
                                <li key={`${card.slug}-next-${index}`}>・{nextStep}</li>
                            ))}
                        </ul>
                    </section>
                )}

                <ProjectNoteForm
                    cardSlug={card.slug}
                    label="このプロジェクトについて"
                    placeholder="答え・訂正・状況・「これはもう終わった」など、何でも"
                    latestNote={latestNote}
                    onSaved={onNoteSaved}
                />
            </div>
        </article>
    )
}
