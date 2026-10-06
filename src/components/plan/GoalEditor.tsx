'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { formatHours, type GoalStatus } from '@/src/lib/schedules/free-time';
import { GoalVerdict } from '@/src/components/plan/goal-format';
import type { PlanGoalRow, PlanGoalUpdate } from '@/src/lib/supabase/queries/plan-goals';

type GoalEditorProps = {
    goals: PlanGoalRow[];
    /** 期日の入力の上限（YYYY-MM-DD）。 */
    maxDueOn?: string;
    statuses: GoalStatus[];
    onAdd: () => void;
    onUpdate: (id: string, patch: PlanGoalUpdate) => void;
    onRemove: (id: string) => void;
};

/**
 * 目標の一覧と編集。どの欄も入力欄を離れたときに保存する（年を打つ途中の値を1打ごとに送らない）。
 * 入力欄は非制御で、key に保存済みの値を含める。保存に失敗して読み直したら、欄も保存済みの値に戻る。
 * 進捗の入力欄は持たない（予定の板に名前を含む時刻範囲つきの行を書くと「置いた」に入る）。
 */
export function GoalEditor({ goals, maxDueOn, statuses, onAdd, onUpdate, onRemove }: GoalEditorProps) {
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
                                {/* Input は w-full が既定なので、幅は外側の箱で決める */}
                                <div className="min-w-0 flex-1 basis-60">
                                    <Input
                                        key={`name-${g.name}`}
                                        defaultValue={g.name}
                                        placeholder="名前（予定の行にこの語を含めると数える）"
                                        aria-label="目標の名前"
                                        onBlur={(e) => {
                                            if (e.target.value !== g.name) onUpdate(g.id, { name: e.target.value });
                                        }}
                                    />
                                </div>
                                <div className="w-40 shrink-0">
                                    <Input
                                        key={`due-${g.due_on}`}
                                        type="date"
                                        defaultValue={g.due_on}
                                        max={maxDueOn}
                                        aria-label="期日"
                                        onBlur={(e) => {
                                            const v = e.target.value;
                                            // 空・形式外・上限超えは保存せず、保存済みの値に戻す
                                            if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || (maxDueOn && v > maxDueOn)) {
                                                e.target.value = g.due_on;
                                                return;
                                            }
                                            if (v !== g.due_on) onUpdate(g.id, { due_on: v });
                                        }}
                                    />
                                </div>
                                <div className="w-28 shrink-0">
                                    <Input
                                        key={`time-${g.due_time ?? ''}`}
                                        type="time"
                                        defaultValue={g.due_time ? g.due_time.slice(0, 5) : ''}
                                        aria-label="期日の時刻（空ならその日の終わり）"
                                        onBlur={(e) => {
                                            const v = e.target.value || null;
                                            if (v !== (g.due_time ? g.due_time.slice(0, 5) : null)) onUpdate(g.id, { due_time: v });
                                        }}
                                    />
                                </div>
                                <label className="inline-flex items-center gap-1 whitespace-nowrap text-sm text-neutral-700 dark:text-neutral-300">
                                    必要
                                    <span className="w-20">
                                        <Input
                                            key={`need-${g.need_minutes}`}
                                            type="number"
                                            min={0}
                                            step={0.5}
                                            defaultValue={g.need_minutes / 60}
                                            className="text-right"
                                            onBlur={(e) => {
                                                const minutes = Math.max(0, Math.round(Number(e.target.value) * 60) || 0);
                                                if (minutes !== g.need_minutes) onUpdate(g.id, { need_minutes: minutes });
                                            }}
                                        />
                                    </span>
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
