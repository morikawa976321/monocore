import { TriangleAlert } from 'lucide-react';
import { formatHours, type GoalStatus } from '@/src/lib/schedules/free-time';

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** "10/16 金 10:50"（時刻が無ければ日付と曜日だけ）。 */
export function formatDue(dueOn: string, dueMinutes: number | null): string {
    const [y, m, d] = dueOn.split('-').map(Number);
    const dow = DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    const time =
        dueMinutes === null
            ? ''
            : ` ${String(Math.floor(dueMinutes / 60)).padStart(2, '0')}:${String(dueMinutes % 60).padStart(2, '0')}`;
    return `${m}/${d} ${dow}${time}`;
}

/** 余裕（締切までの空き − 残り必要時間の累計）か、不足を出す。 */
export function GoalVerdict({ status }: { status: GoalStatus }) {
    if (status.past) {
        return <span className="text-neutral-700 dark:text-neutral-300">期日を過ぎました</span>;
    }
    if (status.ok) {
        return (
            <span className="text-neutral-700 dark:text-neutral-300">
                余裕{' '}
                <span className="font-medium text-neutral-900 dark:text-neutral-50">
                    {formatHours(status.supplyMinutes - status.cumulativeMinutes)}h
                </span>
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
            <TriangleAlert className="w-4 h-4" />
            不足 {formatHours(status.cumulativeMinutes - status.supplyMinutes)}h
        </span>
    );
}

/** 置いた時間 / 必要な時間 の細い棒。 */
export function PlacedBar({ status }: { status: GoalStatus }) {
    const need = status.goal.needMinutes;
    const ratio = need > 0 ? Math.min(1, status.placedMinutes / need) : 0;
    return (
        <div className="h-1 w-24 shrink-0 overflow-hidden rounded-sm bg-neutral-200 dark:bg-neutral-800">
            <div className="h-1 bg-amber-500 dark:bg-amber-500" style={{ width: `${Math.round(ratio * 100)}%` }} />
        </div>
    );
}
