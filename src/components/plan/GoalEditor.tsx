'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { formatHours, type GoalStatus } from '@/src/lib/schedules/free-time';
import { parseDueInput, parseNeedInput, toDueInputString } from '@/src/lib/plan/goal-input';
import { GoalVerdict } from '@/src/components/plan/goal-format';
import type { PlanGoalRow, PlanGoalUpdate } from '@/src/lib/supabase/queries/plan-goals';

/** 必要時間の欄の表示（時間、小数2桁まで）。 */
function needText(minutes: number): string {
    return String(Math.round((minutes / 60) * 100) / 100);
}

type GoalEditorProps = {
    goals: PlanGoalRow[];
    /** 年の無い期日の補完と、期日の上限（YYYY-MM-DD）に使う。 */
    today: string;
    nowMinutes: number;
    maxDueOn: string;
    statuses: GoalStatus[];
    onAdd: () => void;
    onUpdate: (id: string, patch: PlanGoalUpdate) => void;
    onRemove: (id: string) => void;
};

/**
 * 目標の一覧と編集。どの欄も入力欄を離れたときに保存する（年を打つ途中の値を1打ごとに送らない）。
 * 入力欄は非制御で、key に保存済みの値を含める。保存に失敗して読み直したら、欄も保存済みの値に戻る。
 * 読めない値は保存せず、欄に残して枠を琥珀色にする（予定の板の Invalid と同じく、黙って捨てない）。
 * 進捗の入力欄は持たない（予定の板に名前を含む時刻範囲つきの行を書くと「置いた」に入る）。
 */
export function GoalEditor({ goals, today, nowMinutes, maxDueOn, statuses, onAdd, onUpdate, onRemove }: GoalEditorProps) {
    const [invalid, setInvalid] = useState<ReadonlySet<string>>(new Set());
    const markInvalid = (key: string, isInvalid: boolean) =>
        setInvalid((prev) => {
            if (prev.has(key) === isInvalid) return prev;
            const next = new Set(prev);
            if (isInvalid) next.add(key);
            else next.delete(key);
            return next;
        });

    const statusById = new Map(statuses.map((s) => [s.goal.id, s]));
    const sorted = [...goals].sort((a, b) =>
        a.due_on === b.due_on ? (a.due_time ?? '99').localeCompare(b.due_time ?? '99') : a.due_on < b.due_on ? -1 : 1
    );

    return (
        <div className="space-y-2">
            {/* 目標が無いときは空の ul を置かない（space-y-2 の隙間だけが追加ボタンの上に残るため） */}
            {sorted.length > 0 && (
                <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    {sorted.map((g) => {
                        const s = statusById.get(g.id);
                        const savedDue = toDueInputString(g.due_on, g.due_time);
                        return (
                            <li key={g.id} className="space-y-1 py-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    {/* Input は w-full が既定なので、幅は外側の箱で決める */}
                                    <div className="min-w-0 flex-1 basis-60">
                                        <Input
                                            key={`name-${g.name}`}
                                            defaultValue={g.name}
                                            placeholder="名前"
                                            aria-label="目標の名前"
                                            onBlur={(e) => {
                                                if (e.target.value !== g.name) onUpdate(g.id, { name: e.target.value });
                                            }}
                                        />
                                    </div>
                                    <div className="w-36 shrink-0">
                                        <Input
                                            key={`due-${savedDue}`}
                                            defaultValue={savedDue}
                                            inputMode="numeric"
                                            aria-label="期日"
                                            aria-invalid={invalid.has(`${g.id}:due`) || undefined}
                                            title="MMDD / MMDDHHMM / YYYYMMDD / YYYYMMDDHHMM"
                                            onBlur={(e) => {
                                                const due = parseDueInput(e.target.value, today, nowMinutes);
                                                const ok = due !== null && due.dueOn <= maxDueOn;
                                                markInvalid(`${g.id}:due`, !ok);
                                                if (!ok) return;
                                                // 補った年をその場で見せる（保存済みと同じ値なら key が変わらず欄が作り直されないため）
                                                e.target.value = toDueInputString(due.dueOn, due.dueTime);
                                                if (e.target.value !== savedDue) onUpdate(g.id, { due_on: due.dueOn, due_time: due.dueTime });
                                            }}
                                        />
                                    </div>
                                    <label className="inline-flex items-center gap-1 whitespace-nowrap text-sm text-neutral-700 dark:text-neutral-300">
                                        必要
                                        <span className="w-16">
                                            <Input
                                                key={`need-${g.need_minutes}`}
                                                defaultValue={needText(g.need_minutes)}
                                                inputMode="decimal"
                                                aria-label="必要時間"
                                                aria-invalid={invalid.has(`${g.id}:need`) || undefined}
                                                className="text-right"
                                                onBlur={(e) => {
                                                    const minutes = parseNeedInput(e.target.value);
                                                    markInvalid(`${g.id}:need`, minutes === null);
                                                    if (minutes === null) return;
                                                    e.target.value = needText(minutes);
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
            )}
            <Button color="secondary" size="md" onClick={onAdd}>
                <Plus className="w-4 h-4" />
                目標を追加
            </Button>
        </div>
    );
}
