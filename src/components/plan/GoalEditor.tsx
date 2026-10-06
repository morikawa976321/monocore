'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { formatHours, type GoalStatus } from '@/src/lib/schedules/free-time';
import { GoalVerdict } from '@/src/components/plan/goal-format';
import type { PlanGoalRow, PlanGoalUpdate } from '@/src/lib/supabase/queries/plan-goals';

type GoalEditorProps = {
    goals: PlanGoalRow[];
    statuses: GoalStatus[];
    onAdd: () => void;
    onUpdate: (id: string, patch: PlanGoalUpdate) => void;
    onRemove: (id: string) => void;
};

/**
 * 目標の一覧と編集。名前と必要時間は入力欄を離れたときに、日付と時刻は変えたときに保存する。
 * 進捗の入力欄は持たない（予定の板に名前を含む時刻範囲つきの行を書くと「置いた」に入る）。
 */
export function GoalEditor({ goals, statuses, onAdd, onUpdate, onRemove }: GoalEditorProps) {
    const statusById = new Map(statuses.map((s) => [s.goal.id, s]));
    const sorted = [...goals].sort((a, b) =>
        a.due_on === b.due_on ? (a.due_time ?? '99').localeCompare(b.due_time ?? '99') : a.due_on < b.due_on ? -1 : 1
    );

    return (
        <div className="space-y-2">
            {sorted.length === 0 && (
                <p className="text-sm text-neutral-700 dark:text-neutral-300">
                    目標はまだありません。「この日までにこれを終える」を追加してください。
                </p>
            )}
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {sorted.map((g) => {
                    const s = statusById.get(g.id);
                    return (
                        <li key={g.id} className="space-y-1 py-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <Input
                                    defaultValue={g.name}
                                    placeholder="名前（予定の行にこの語を含めると数える）"
                                    aria-label="目標の名前"
                                    className="min-w-0 flex-1 basis-60"
                                    onBlur={(e) => {
                                        if (e.target.value !== g.name) onUpdate(g.id, { name: e.target.value });
                                    }}
                                />
                                <Input
                                    type="date"
                                    value={g.due_on}
                                    aria-label="期日"
                                    className="w-40"
                                    onChange={(e) => {
                                        if (e.target.value) onUpdate(g.id, { due_on: e.target.value });
                                    }}
                                />
                                <Input
                                    type="time"
                                    value={g.due_time ? g.due_time.slice(0, 5) : ''}
                                    aria-label="期日の時刻（空ならその日の終わり）"
                                    className="w-28"
                                    onChange={(e) => onUpdate(g.id, { due_time: e.target.value || null })}
                                />
                                <label className="inline-flex items-center gap-1 whitespace-nowrap text-sm text-neutral-700 dark:text-neutral-300">
                                    必要
                                    <Input
                                        type="number"
                                        min={0}
                                        step={0.5}
                                        defaultValue={g.need_minutes / 60}
                                        className="w-20 text-right"
                                        onBlur={(e) => {
                                            const minutes = Math.max(0, Math.round(Number(e.target.value) * 60) || 0);
                                            if (minutes !== g.need_minutes) onUpdate(g.id, { need_minutes: minutes });
                                        }}
                                    />
                                    h
                                </label>
                                <Button color="ghost" size="icon" aria-label="目標を削除" title="目標を削除" onClick={() => onRemove(g.id)}>
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                            {s && (
                                <div className="flex flex-wrap items-center gap-x-4 text-sm text-neutral-700 dark:text-neutral-300">
                                    <span>置いた {formatHours(s.placedMinutes)}h</span>
                                    {!s.past && <span>締切までの空き {formatHours(s.supplyMinutes)}h</span>}
                                    <GoalVerdict status={s} />
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Button color="secondary" size="md" onClick={onAdd}>
                    <Plus className="w-4 h-4" />
                    目標を追加
                </Button>
                <span className="text-sm text-neutral-700 dark:text-neutral-300">
                    予定の板に「1300-1600 名前」のように時刻範囲つきで書くと「置いた」に入ります。終わった目標は削除してください。
                </span>
            </div>
        </div>
    );
}
