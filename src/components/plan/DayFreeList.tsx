import Link from 'next/link';
import { FreeTimeStrip } from '@/src/components/plan/FreeTimeStrip';
import { formatHours, type DayAnalysis } from '@/src/lib/schedules/free-time';
import { formatDue } from '@/src/components/plan/goal-format';

type DayFreeListProps = {
    days: { date: string; analysis: DayAnalysis }[];
    today: string;
    nowMinutes: number;
    /** 日付 → その日が期日の目標名。 */
    deadlines: Map<string, string[]>;
};

/** 日ごとの帯の一覧。行を押すとスケジュール画面のその日へ移る。 */
export function DayFreeList({ days, today, nowMinutes, deadlines }: DayFreeListProps) {
    return (
        <ul className="space-y-1">
            {days.map(({ date, analysis }) => {
                const isToday = date === today;
                const names = deadlines.get(date);
                return (
                    <li key={date}>
                        <Link
                            href={`/schedules?day=${date}`}
                            title="スケジュールのこの日へ"
                            className="flex items-center gap-2 rounded-sm px-1 text-sm leading-6 transition-colors duration-150 ease-in-out hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 dark:hover:bg-neutral-800 dark:focus-visible:ring-neutral-600"
                        >
                            <span
                                className={`w-16 shrink-0 ${isToday ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-neutral-700 dark:text-neutral-300'}`}
                            >
                                {formatDue(date, null)}
                            </span>
                            <span className="min-w-0 flex-1">
                                <FreeTimeStrip analysis={analysis} nowMinutes={isToday ? nowMinutes : undefined} />
                            </span>
                            <span className="w-12 shrink-0 text-right font-medium">{formatHours(analysis.freeMinutes)}</span>
                            <span className="hidden w-40 shrink-0 truncate text-amber-600 dark:text-amber-400 sm:block">
                                {names ? `締切: ${names.join('・')}` : ''}
                            </span>
                        </Link>
                    </li>
                );
            })}
        </ul>
    );
}
