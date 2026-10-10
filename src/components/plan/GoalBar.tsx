'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { formatHours, type GoalStatus } from '@/src/lib/schedules/free-time';
import { GoalVerdict, PlacedBar } from '@/src/components/plan/goal-format';
import { formatDue } from '@/src/lib/plan/goal-format';

/** 帯に並べる目標の数。増えると予定の板が押し下げられるので、締切の近い順にここまで。 */
const MAX_ROWS = 3;

/**
 * スケジュール画面の上に、期日前の目標ごとの数字を出す帯。予定を書き換えるとその場で変わる。
 * グラフと目標の編集は /plan。スマホでは1行に畳む。
 */
export function GoalBar({ statuses }: { statuses: GoalStatus[] }) {
    const [isOpen, setIsOpen] = useState(false);
    const upcoming = statuses.filter((s) => !s.past);
    if (upcoming.length === 0) return null;
    const shortCount = upcoming.filter((s) => !s.ok).length;
    const rest = upcoming.length - MAX_ROWS;

    return (
        // 下の線は日カードの枠と同じ濃さにする。ヘッダーと同じ薄い線では、下へ潜り込む日カードの本文と同じ背景色が
        // 線をまたいで続き、帯とカードの境目が分からなかった(2026-10-07 本人指摘)。
        <div className="shrink-0 border-b border-neutral-400 bg-neutral-50 px-2 py-2 text-sm leading-6 dark:border-neutral-600 dark:bg-neutral-900 sm:px-6">
            <div className="flex items-center justify-between gap-2">
                <span className="text-neutral-700 dark:text-neutral-300">
                    目標 <span className="font-medium text-neutral-900 dark:text-neutral-50">{upcoming.length}</span>
                    {' ・ '}
                    {shortCount > 0 ? (
                        <span className="font-medium text-amber-600 dark:text-amber-400">{shortCount}件 不足</span>
                    ) : (
                        '間に合う見込み'
                    )}
                </span>
                <div className="flex items-center gap-2">
                    <Button
                        color="ghost"
                        size="icon"
                        className="sm:hidden"
                        onClick={() => setIsOpen((v) => !v)}
                        aria-expanded={isOpen}
                        aria-label={isOpen ? '目標を畳む' : '目標を開く'}
                    >
                        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                    <Link
                        href="/plan"
                        className="rounded-sm text-neutral-700 underline underline-offset-4 transition-colors duration-150 ease-in-out hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 dark:text-neutral-300 dark:hover:text-neutral-50 dark:focus-visible:ring-neutral-600"
                    >
                        計画
                    </Link>
                </div>
            </div>
            <ul className={`${isOpen ? 'block' : 'hidden'} sm:block`}>
                {upcoming.slice(0, MAX_ROWS).map((s) => (
                    <li
                        key={s.goal.id}
                        className="flex flex-wrap items-center gap-x-4 border-t border-neutral-200 py-1 dark:border-neutral-800 sm:flex-nowrap sm:border-t-0 sm:py-0"
                    >
                        <span className="w-28 shrink-0 text-neutral-700 dark:text-neutral-300">
                            {formatDue(s.goal.dueOn, s.goal.dueMinutes)}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">{s.goal.name || '（名前なし）'}</span>
                        <span className="hidden md:block">
                            <PlacedBar status={s} />
                        </span>
                        <span className="shrink-0 text-neutral-700 dark:text-neutral-300">
                            置いた {formatHours(s.placedMinutes)} / 必要 {formatHours(s.goal.needMinutes)}h
                        </span>
                        <span className="hidden shrink-0 text-neutral-700 dark:text-neutral-300 md:inline">
                            締切までの空き {formatHours(s.supplyMinutes)}h
                        </span>
                        <span className="shrink-0 sm:w-28 sm:text-right">
                            <GoalVerdict status={s} />
                        </span>
                    </li>
                ))}
                {rest > 0 && (
                    <li className="text-neutral-700 dark:text-neutral-300">ほか {rest}件（計画で確認）</li>
                )}
            </ul>
        </div>
    );
}
