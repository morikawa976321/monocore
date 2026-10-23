'use client';

import { useState } from 'react';
import { AutoHeightTextarea } from '@/src/components/schedules/AutoHeightTextarea';
import type { BlockedProjectRow, BlockedProjectUpdate } from '@/src/lib/supabase/queries/blocked-projects';
import { BULLET, fromBulletedText, toBulletedText } from '@/src/lib/tasks/bullets';
import { SLOT_ROWS } from '@/src/lib/tasks/slots';

type Props = {
    projects: BlockedProjectRow[];
    /** 囲みの外枠・見出しの帯・本文の余白。ページ側の定数を受け取る（Finance の card.ts と同じ文字列）。 */
    cardClassName: string;
    headerClassName: string;
    bodyClassName: string;
    /** その枠の行がまだ無いときに、最初の保存で作る。 */
    onCreate: (name: string, tasks: string) => void;
    /** loadedUpdatedAt は画面が持っている行の版。保存はこの版のままのときだけ通る（楽観ロック）。 */
    onUpdate: (id: string, loadedUpdatedAt: string, patch: BlockedProjectUpdate) => void;
};

type CardProps = Pick<Props, 'cardClassName' | 'headerClassName' | 'bodyClassName'> & {
    name: string;
    /** その枠の行。まだ作られていなければ undefined。 */
    project: BlockedProjectRow | undefined;
    onSave: (tasks: string) => void;
};

/**
 * 1枠1枚。見出しは枠の名前で固定（画面から改名・追加・削除はしない）、本文がタスク（1行に1つ）。
 * 本文は行頭に箇条書きの点を付けて出し、改行すると次の行にも点を打つ。保存するときは点を外す（src/lib/tasks/bullets.ts）。
 * 保存は欄を離れたとき。付帯情報（待ち日数・返し方など）は持たない（docs/decisions.md「本人待ちの表示」）。
 */
function SlotCard({ name, project, cardClassName, headerClassName, bodyClassName, onSave }: CardProps) {
    const saved = project?.tasks ?? '';
    // 本文は高さを内容に合わせるため制御する。保存済みの値が変わったら入力欄をそれに合わせる。
    // カードを key で作り直すと、欄を離れた直後のクリックやフォーカス移動の先まで置き換わるので、作り直さない。
    const [text, setText] = useState(() => toBulletedText(saved));
    const [syncedTasks, setSyncedTasks] = useState(saved);
    if (saved !== syncedTasks) {
        setSyncedTasks(saved);
        setText(toBulletedText(saved));
    }
    return (
        <section className={cardClassName}>
            <h2 className={headerClassName}>{name}</h2>
            <div className={bodyClassName}>
                <AutoHeightTextarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onFocus={() => {
                        if (text === '') setText(BULLET);
                    }}
                    onKeyDown={(e) => {
                        // 変換の確定の Enter は改行ではないので触らない。Safari 系は確定の Enter を isComposing=false、
                        // keyCode=229 で送ることがあるので keyCode も見る。
                        if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.keyCode === 229) return;
                        e.preventDefault();
                        const ta = e.currentTarget;
                        const { selectionStart: start, selectionEnd: end } = ta;
                        const insert = '\n' + BULLET;
                        setText(text.slice(0, start) + insert + text.slice(end));
                        requestAnimationFrame(() => ta.setSelectionRange(start + insert.length, start + insert.length));
                    }}
                    onBlur={() => {
                        const tasks = fromBulletedText(text);
                        setText(toBulletedText(tasks));
                        if (tasks !== saved) onSave(tasks);
                    }}
                    placeholder="タスク（1行に1つ）"
                    aria-label={`${name}のタスク`}
                    className="min-h-6 resize-none leading-6"
                    spellCheck={false}
                    autoComplete="off"
                    autoCorrect="off"
                />
            </div>
        </section>
    );
}

/** 枠のカードを段ごとに並べる（1段目が固定枠、2段目が自由枠）。段の間は段の中より広く空けて分ける。 */
export function BlockedProjectCards({ projects, onCreate, onUpdate, ...cardProps }: Props) {
    return (
        <div className="space-y-4 sm:space-y-6">
            {SLOT_ROWS.map((row) => (
                <div key={row.join('/')} className="grid gap-2 sm:gap-4 sm:grid-cols-2">
                    {row.map((name) => {
                        const project = projects.find((p) => p.name === name);
                        return (
                            <SlotCard
                                key={name}
                                name={name}
                                project={project}
                                onSave={(tasks) =>
                                    project ? onUpdate(project.id, project.updated_at, { tasks }) : onCreate(name, tasks)
                                }
                                {...cardProps}
                            />
                        );
                    })}
                </div>
            ))}
        </div>
    );
}
