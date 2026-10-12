import { TriangleAlert } from 'lucide-react';
import { formatHours, type GoalStatus } from '@/src/lib/schedules/free-time';
import { goalVerdict } from '@/src/lib/plan/goal-format';

/** 余裕（締切までの空き − 残り必要時間の累計）か、不足を出す。計算は lib/plan/goal-format.ts。 */
export function GoalVerdict({ status }: { status: GoalStatus }) {
    const verdict = goalVerdict(status);
    if (verdict.kind === 'past') {
        return <span className="text-neutral-700 dark:text-neutral-300">期日を過ぎました</span>;
    }
    if (verdict.kind === 'ok') {
        return (
            <span className="text-neutral-700 dark:text-neutral-300">
                余裕{' '}
                <span className="font-medium text-neutral-900 dark:text-neutral-50">
                    {formatHours(verdict.marginMinutes)}h
                </span>
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
            <TriangleAlert className="w-4 h-4" />
            不足 {formatHours(verdict.deficitMinutes)}h
        </span>
    );
}
