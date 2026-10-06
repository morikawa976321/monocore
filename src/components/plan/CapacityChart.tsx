import type { GoalStatus } from '@/src/lib/schedules/free-time';

export type CapacityDay = {
    date: string;
    /** その日に使える空き（今日は今以降、生活時間を差し引いた後）。 */
    usableMinutes: number;
    wake: number;
    sleep: number;
};

function niceStep(maxHours: number): number {
    if (maxHours <= 60) return 10;
    if (maxHours <= 150) return 25;
    if (maxHours <= 300) return 50;
    return 100;
}

function shortDate(date: string): string {
    const [, m, d] = date.split('-').map(Number);
    return `${m}/${d}`;
}

function isMonday(date: string): boolean {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 1;
}

/**
 * 今日から積み上げた「使える空き」の階段と、締切の早い順に積んだ「残り必要時間」の線。
 * 線が階段より下にあれば間に合う。横位置・高さはすべて % で置き、幅に追従させる。
 */
export function CapacityChart({ days, statuses }: { days: CapacityDay[]; statuses: GoalStatus[] }) {
    const n = days.length;
    if (n === 0) return null;
    const cols: (CapacityDay & { c0: number; c1: number })[] = [];
    for (const d of days) {
        const c0 = cols.length > 0 ? cols[cols.length - 1].c1 : 0;
        cols.push({ ...d, c0, c1: c0 + d.usableMinutes });
    }
    const cum = cols[cols.length - 1].c1;
    const upcoming = statuses.filter((s) => !s.past && days.some((d) => d.date === s.goal.dueOn));
    const maxDemand = upcoming.reduce((m, s) => Math.max(m, s.cumulativeMinutes), 0);
    const topHours = Math.max(cum, maxDemand) / 60;
    const step = niceStep(topHours);
    const yMax = Math.max(step, Math.ceil(topHours / step) * step);
    const y = (minutes: number) => (minutes / 60 / yMax) * 100;
    const x = (index: number) => (index / n) * 100;
    const ticks: number[] = [];
    for (let v = step; v <= yMax; v += step) ticks.push(v);

    // 必要時間の線は前の締切の点から次の締切の点へ階段状に引く。
    const marks: { s: GoalStatus; k: number; mx: number; my: number; fromX: number; fromY: number }[] = [];
    upcoming.forEach((s, k) => {
        const i = days.findIndex((d) => d.date === s.goal.dueOn);
        const day = days[i];
        const due = s.goal.dueMinutes ?? day.sleep;
        const within = Math.max(0, Math.min(1, (due - day.wake) / Math.max(1, day.sleep - day.wake)));
        const prev = marks[marks.length - 1];
        marks.push({ s, k, mx: x(i + within), my: y(s.cumulativeMinutes), fromX: prev ? prev.mx : 0, fromY: prev ? prev.my : 0 });
    });

    return (
        <div className="space-y-2">
            <div className="relative ml-12 mt-12 mb-6 h-56 border-b border-neutral-400 dark:border-neutral-600">
                {ticks.map((v) => (
                    <div key={v} className="absolute inset-x-0 h-px bg-neutral-200 dark:bg-neutral-800" style={{ bottom: `${y(v * 60)}%` }}>
                        <span className="absolute -left-12 -top-2 w-10 text-right text-sm leading-4 text-neutral-700 dark:text-neutral-300">{v}h</span>
                    </div>
                ))}
                {cols.map((c, i) => (
                    <div key={c.date} className="absolute inset-y-0" style={{ left: `${x(i)}%`, width: `${100 / n}%` }}>
                        <div
                            title={`${shortDate(c.date)} 使える空き ${(c.usableMinutes / 60).toFixed(1)}h → 累計 ${(c.c1 / 60).toFixed(1)}h`}
                            className="absolute inset-x-px bottom-0 bg-neutral-200 dark:bg-neutral-800"
                            style={{ height: `${y(c.c0)}%` }}
                        />
                        <div
                            className={`absolute inset-x-px ${i === 0 ? 'bg-amber-500 dark:bg-amber-400' : 'bg-neutral-600 dark:bg-neutral-400'}`}
                            style={{ bottom: `${y(c.c0)}%`, height: `${Math.max(0.5, y(c.c1) - y(c.c0))}%` }}
                        />
                        {(i === 0 || isMonday(c.date)) && (
                            <span
                                className={`absolute left-0 top-full mt-1 whitespace-nowrap text-sm leading-4 ${i === 0 ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-700 dark:text-neutral-300'}`}
                            >
                                {shortDate(c.date)}
                            </span>
                        )}
                    </div>
                ))}
                {marks.map(({ s, k, mx, my, fromX, fromY }) => (
                    <div key={s.goal.id}>
                        <div className="absolute bottom-0 top-0 border-l border-dashed border-amber-500/60 dark:border-amber-400/60" style={{ left: `${mx}%` }} />
                        <div className="absolute h-0.5 bg-amber-500 dark:bg-amber-400" style={{ left: `${fromX}%`, width: `${Math.max(0, mx - fromX)}%`, bottom: `${fromY}%` }} />
                        <div className="absolute w-0.5 bg-amber-500 dark:bg-amber-400" style={{ left: `${mx}%`, bottom: `${fromY}%`, height: `${Math.max(0, my - fromY)}%` }} />
                        <div
                            className={`absolute -ml-1 -mb-1 h-2 w-2 rounded-full ${s.ok ? 'bg-amber-500 dark:bg-amber-400' : 'border-2 border-amber-600 bg-neutral-50 dark:border-amber-400 dark:bg-neutral-900'}`}
                            style={{ left: `${mx}%`, bottom: `${my}%` }}
                            title={`${s.goal.name} 必要の累計 ${(s.cumulativeMinutes / 60).toFixed(1)}h / 締切までの空き ${(s.supplyMinutes / 60).toFixed(1)}h`}
                        />
                        <span
                            className={`absolute max-w-48 truncate pr-1 text-right text-sm leading-4 ${k % 2 === 0 ? 'bottom-full mb-1' : 'bottom-full mb-6'} ${s.ok ? 'text-amber-600 dark:text-amber-400' : 'font-medium text-amber-600 dark:text-amber-400'}`}
                            style={{ right: `${100 - mx}%` }}
                        >
                            {s.goal.name || '（名前なし）'}
                            {s.ok ? '' : ' 不足'}
                        </span>
                    </div>
                ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-700 dark:text-neutral-300">
                <span className="inline-flex items-center gap-1">
                    <span className="inline-block h-2 w-4 rounded-sm bg-neutral-600 dark:bg-neutral-400" />
                    1日の使える空き（累計の段）
                </span>
                <span className="inline-flex items-center gap-1">
                    <span className="inline-block h-0.5 w-4 bg-amber-500 dark:bg-amber-400" />
                    目標の残り必要時間の累計（線が段より下なら間に合う）
                </span>
            </div>
        </div>
    );
}
