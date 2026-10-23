'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { AutoHeightTextarea } from '@/src/components/schedules/AutoHeightTextarea';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import type { BlockedProjectRow, BlockedProjectUpdate } from '@/src/lib/supabase/queries/blocked-projects';

type Props = {
    projects: BlockedProjectRow[];
    /** 囲みの外枠・見出しの帯・本文の余白。ページの他のカードと揃えるため、ページ側の定数を受け取る。 */
    cardClassName: string;
    headerClassName: string;
    bodyClassName: string;
    onAdd: () => void;
    onUpdate: (id: string, patch: BlockedProjectUpdate) => void;
    onRemove: (id: string) => void;
};

type CardProps = Omit<Props, 'projects' | 'onAdd'> & { project: BlockedProjectRow };

/**
 * 1プロジェクト1枚。見出しがプロジェクト名、本文がタスク（1行に1つ）で、どちらもその場で書き換える。
 * 保存は欄を離れたとき。付帯情報（待ち日数・返し方など）は持たない（docs/decisions.md「本人待ちの表示」）。
 */
function BlockedProjectCard({ project, cardClassName, headerClassName, bodyClassName, onUpdate, onRemove }: CardProps) {
    // 本文は高さを内容に合わせるため制御する。保存済みの値が変わると親の key で作り直される。
    const [tasks, setTasks] = useState(project.tasks);
    return (
        <section className={cardClassName}>
            <div className={`${headerClassName} flex items-center gap-2`}>
                <Input
                    key={`name-${project.name}`}
                    variant="plain"
                    defaultValue={project.name}
                    placeholder="プロジェクト名"
                    aria-label="プロジェクト名"
                    className="min-w-0 flex-1"
                    onBlur={(e) => {
                        if (e.target.value !== project.name) onUpdate(project.id, { name: e.target.value });
                    }}
                />
                <Button
                    color="ghost"
                    size="icon"
                    aria-label="プロジェクトを削除"
                    title="プロジェクトを削除"
                    onClick={() => onRemove(project.id)}
                >
                    <Trash2 className="w-4 h-4" />
                </Button>
            </div>
            <div className={bodyClassName}>
                <AutoHeightTextarea
                    value={tasks}
                    onChange={(e) => setTasks(e.target.value)}
                    onBlur={() => {
                        if (tasks !== project.tasks) onUpdate(project.id, { tasks });
                    }}
                    placeholder="タスク（1行に1つ）"
                    aria-label={`${project.name || 'プロジェクト'}のタスク`}
                    className="min-h-6 resize-none leading-6"
                    spellCheck={false}
                    autoComplete="off"
                    autoCorrect="off"
                />
            </div>
        </section>
    );
}

/** プロジェクトを1つにつき1枚のカードで並べる。中身は本人の手入力か、指示を受けた AI がスキルから書き換える。 */
export function BlockedProjectCards({ projects, onAdd, ...cardProps }: Props) {
    return (
        <div className="space-y-2">
            {projects.length > 0 && (
                <div className="grid gap-2 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {projects.map((p) => (
                        <BlockedProjectCard key={`${p.id}:${p.tasks}`} project={p} {...cardProps} />
                    ))}
                </div>
            )}
            <Button color="secondary" size="md" onClick={onAdd}>
                <Plus className="w-4 h-4" />
                プロジェクトを追加
            </Button>
        </div>
    );
}
