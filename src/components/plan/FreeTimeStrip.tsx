import type { CSSProperties } from 'react';
import type { DayAnalysis, SlotKind } from '@/src/lib/schedules/free-time';

const DAY_MINUTES = 24 * 60;

/** 睡眠・非自由・自由の3色。自由が主役なので琥珀色。 */
const KIND_CLASS: Record<SlotKind, string> = {
    sleep: 'bg-neutral-200 dark:bg-neutral-800',
    busy: 'bg-neutral-500 dark:bg-neutral-400',
    free: 'bg-amber-500/40 dark:bg-amber-500/40',
};

function percent(minutes: number): number {
    return (minutes / DAY_MINUTES) * 100;
}

function span(start: number, end: number): CSSProperties {
    return { left: `${percent(start)}%`, width: `${percent(end) - percent(start)}%` };
}

type FreeTimeStripProps = {
    analysis: DayAnalysis;
    /** 今日だけ渡す。今の時刻に縦線を引く。 */
    nowMinutes?: number;
};

/** 1日（0:00〜24:00）を睡眠・非自由・自由で塗り分けた帯。 */
export function FreeTimeStrip({ analysis, nowMinutes }: FreeTimeStripProps) {
    return (
        <div className="relative h-2 rounded-sm border border-neutral-200 dark:border-neutral-800" aria-hidden="true">
            {analysis.runs.map((r) => (
                <div key={r.start} className={`absolute inset-y-0 ${KIND_CLASS[r.kind]}`} style={span(r.start, r.end)} />
            ))}
            {nowMinutes !== undefined && (
                <div
                    className="absolute -inset-y-1 w-0.5 bg-neutral-900 dark:bg-neutral-50"
                    style={{ left: `${percent(nowMinutes)}%` }}
                />
            )}
        </div>
    );
}

/** 帯の凡例。 */
export function FreeTimeLegend() {
    const items: [SlotKind, string][] = [
        ['free', '自由'],
        ['busy', '非自由（予定・起床後の身支度）'],
        ['sleep', '睡眠'],
    ];
    return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-700 dark:text-neutral-300">
            <span>帯は 0:00〜24:00</span>
            {items.map(([kind, label]) => (
                <span key={kind} className="inline-flex items-center gap-1">
                    <span className={`inline-block h-2 w-4 rounded-sm ${KIND_CLASS[kind]}`} />
                    {label}
                </span>
            ))}
        </div>
    );
}
