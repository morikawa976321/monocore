'use client';

import { useState } from 'react';
import { AutoHeightTextarea } from '@/src/components/schedules/AutoHeightTextarea';
import type { BlockedProjectRow, BlockedProjectUpdate } from '@/src/lib/supabase/queries/blocked-projects';
import { BULLET, fromBulletedText } from '@/src/lib/tasks/bullets';
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

// 文字の大きさは予定の本文・Inbox と同じ（狭い画面は text-sm、sm 以上は text-base）。
const TEXT = 'text-sm leading-6 sm:text-base sm:leading-7';
// 点の幅（全角の「・」で 1em）だけ本文を右に寄せ、空いた所に点を描く。text-sm=0.875rem、text-base=1rem に合わせる。
const GUTTER = 'pl-3.5 sm:pl-4';

/**
 * 本文の各行の先頭に点を描く層。入力欄に重ね、同じ幅・同じ文字で各行を折り返して、その行の頭の高さに点を置く。
 * 点を本文の文字に入れると、折り返した行が点の下から始まる。CSS の text-indent: hanging each-line は
 * Chrome の textarea では改行後の行に効かない（2026-10-24 に Chrome 152 で確認）ので、この形にした。
 */
function BulletGutter({ text }: { text: string }) {
    return (
        <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words text-transparent ${TEXT} ${GUTTER}`}
        >
            {text.split('\n').map((line, i) => (
                <div key={i} className="relative">
                    <span className="absolute right-full text-neutral-900 dark:text-neutral-100">{BULLET}</span>
                    {/* 空の行も入力欄では1行の高さを持つので、空白を置いて行の箱を作る。 */}
                    {line === '' ? ' ' : line}
                </div>
            ))}
        </div>
    );
}

/**
 * 1枠1枚。見出しは枠の名前で固定（画面から改名・追加・削除はしない）、本文がタスク（1行に1つ）。
 * 本文の各行の頭に箇条書きの点を出す（点は描くだけで、本文の文字には入れない）。保存は欄を離れたときで、
 * 空の行を落とす（src/lib/tasks/bullets.ts）。付帯情報（待ち日数・返し方など）は持たない（docs/decisions.md「本人待ちの表示」）。
 */
function SlotCard({ name, project, cardClassName, headerClassName, bodyClassName, onSave }: CardProps) {
    const saved = project?.tasks ?? '';
    // 本文は高さを内容に合わせるため制御する。保存済みの値が変わったら入力欄をそれに合わせる。
    // カードを key で作り直すと、欄を離れた直後のクリックやフォーカス移動の先まで置き換わるので、作り直さない。
    const [text, setText] = useState(saved);
    const [syncedTasks, setSyncedTasks] = useState(saved);
    const [focused, setFocused] = useState(false);
    if (saved !== syncedTasks) {
        setSyncedTasks(saved);
        setText(saved);
    }
    return (
        <section className={cardClassName}>
            <h2 className={headerClassName}>{name}</h2>
            <div className={bodyClassName}>
                <div className={`relative ${GUTTER}`}>
                    <AutoHeightTextarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onFocus={() => setFocused(true)}
                        onBlur={() => {
                            setFocused(false);
                            const tasks = fromBulletedText(text);
                            setText(tasks);
                            if (tasks !== saved) onSave(tasks);
                        }}
                        placeholder="タスク（1行に1つ）"
                        aria-label={`${name}のタスク`}
                        className={`min-h-6 resize-none ${TEXT}`}
                        spellCheck={false}
                        autoComplete="off"
                        autoCorrect="off"
                    />
                    {/* 空のカードは、触るまで点を出さず placeholder だけにする。 */}
                    {(focused || text !== '') && <BulletGutter text={text} />}
                </div>
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
