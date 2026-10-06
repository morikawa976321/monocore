import type { CSSProperties } from 'react';
import type { DayAnalysis, SlotKind } from '@/src/lib/schedules/free-time';

/** 帯の横軸は 06:00〜24:00（起床・消灯の揺れが収まる幅）。 */
const AXIS_START = 6 * 60;
const AXIS_LENGTH = 18 * 60;

const KIND_CLASS: Record<Exclude<SlotKind, 'free'>, string> = {
    off: 'bg-neutral-200 dark:bg-neutral-800',
    fixed: 'bg-neutral-500 dark:bg-neutral-400',
    estimated: 'bg-neutral-400 dark:bg-neutral-500',
    home: 'bg-neutral-300 dark:bg-neutral-600',
};
const DEEP_CLASS = 'bg-amber-500/20 dark:bg-amber-400/20';

function percent(minutes: number): number {
    return Math.max(0, Math.min(100, ((minutes - AXIS_START) / AXIS_LENGTH) * 100));
}

function span(start: number, end: number): CSSProperties {
    return { left: `${percent(start)}%`, width: `${percent(end) - percent(start)}%` };
}

type FreeTimeStripProps = {
    analysis: DayAnalysis;
    /** 今日だけ渡す。今の時刻に縦線を引く。 */
    nowMinutes?: number;
};

/** 1日の予定と空きを 06:00〜24:00 の帯で描く。2時間以上続く空きは琥珀色で塗る。 */
export function FreeTimeStrip({ analysis, nowMinutes }: FreeTimeStripProps) {
    return (
        <div
            className="relative h-2 rounded-sm border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900"
            aria-hidden="true"
        >
            {analysis.runs
                .filter((r) => r.kind !== 'free' && r.end > AXIS_START)
                .map((r) => (
                    <div
                        key={`r${r.start}`}
                        className={`absolute inset-y-0 ${KIND_CLASS[r.kind as Exclude<SlotKind, 'free'>]}`}
                        style={span(r.start, r.end)}
                    />
                ))}
            {analysis.gaps
                .filter((g) => g.deep)
                .map((g) => (
                    <div key={`g${g.start}`} className={`absolute inset-y-0 ${DEEP_CLASS}`} style={span(g.start, g.end)} />
                ))}
            {nowMinutes !== undefined && nowMinutes >= AXIS_START && (
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
    const items: [string, string][] = [
        [KIND_CLASS.fixed, '確定'],
        [KIND_CLASS.estimated, '推定（終了時刻なし）'],
        [KIND_CLASS.home, '在宅拘束（受け取り）'],
        [DEEP_CLASS, '2h以上の空き'],
        [KIND_CLASS.off, '起床前・消灯後'],
    ];
    return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-700 dark:text-neutral-300">
            <span>帯は 06:00〜24:00</span>
            {items.map(([cls, label]) => (
                <span key={label} className="inline-flex items-center gap-1">
                    <span className={`inline-block h-2 w-4 rounded-sm border border-neutral-200 dark:border-neutral-800 ${cls}`} />
                    {label}
                </span>
            ))}
        </div>
    );
}
