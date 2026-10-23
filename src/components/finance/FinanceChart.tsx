import type { Balance, Measurement } from '@/src/lib/finance/projection';
import { totalOf } from '@/src/lib/finance/projection';
import { monthNumber } from '@/src/lib/finance/month';

/** グリッドの間隔。月の通し番号は年×12 なので、60 の倍数がちょうど5の倍数の年の1月になる。 */
const GRID_MONTHS = 60;
const GRID_YEN = 5_000_000;

/**
 * 合計と Cash の折れ線(実測は実線、予測は破線、縦の破線は最新実測月)。
 * 文字・凡例は持たない(本人の指示 2026-10-23: 表から分かることの繰り返しになるので、グラフだけを出す)。
 * 目盛の代わりに縦横の薄いグリッドを敷く(本人の指示 2026-10-23: 横は5年ごと、縦は500万円ごと)。
 */
export function FinanceChart({ measurements, future }: { measurements: Measurement[]; future: Balance[] }) {
    const actual = [...measurements].sort((a, b) => a.month.localeCompare(b.month)).map(row => ({ ...row, total: totalOf(row.cash, row.nisa) }));
    const base = actual.at(-1);
    const projected = base ? [base, ...future] : [];
    const all = [...actual, ...future];
    if (!base || !all.length) return null;
    const first = monthNumber(all[0].month);
    const span = Math.max(1, monthNumber(all.at(-1)!.month) - first);
    const values = all.flatMap(row => [row.cash, row.total]);
    const min = values.reduce((bound, value) => Math.min(bound, value), 0);
    const max = values.reduce((bound, value) => Math.max(bound, value), 0);
    const range = max - min || 1;
    const xAt = (serial: number) => 8 + (serial - first) / span * 464;
    const x = (month: string) => xAt(monthNumber(month));
    const y = (value: number) => 88 - (value - min) / range * 80;
    const points = (rows: Balance[], key: 'cash' | 'total') => rows.map(row => `${x(row.month)},${y(row[key])}`).join(' ');
    const levels = multiplesIn(min, max, GRID_YEN).filter(value => value !== 0);
    const years = multiplesIn(first + 1, first + span, GRID_MONTHS);
    return (
        <svg
            viewBox="0 0 480 96"
            preserveAspectRatio="none"
            role="img"
            aria-label="月末資産の見通し。合計と Cash、実線は実測、破線は予測。縦の破線は最新実測月。"
            className="block w-full h-32 sm:h-40"
        >
            {/* 縦横比を固定しない SVG なので、線幅は non-scaling-stroke で画面上の 1px に揃える */}
            <g className="stroke-current text-neutral-200 dark:text-neutral-800" strokeWidth="1">
                {levels.map(value => <line key={`y${value}`} x1="8" x2="472" y1={y(value)} y2={y(value)} vectorEffect="non-scaling-stroke" />)}
                {years.map(serial => <line key={`x${serial}`} x1={xAt(serial)} x2={xAt(serial)} y1="8" y2="88" vectorEffect="non-scaling-stroke" />)}
            </g>
            <line x1="8" x2="472" y1={y(0)} y2={y(0)} className="stroke-current text-neutral-400 dark:text-neutral-600" strokeWidth="1" />
            <line x1={x(base.month)} x2={x(base.month)} y1="8" y2="88" strokeDasharray="3 3" className="stroke-current text-amber-600 dark:text-amber-400" />
            {(['total', 'cash'] as const).map(key => (
                <g key={key} className={key === 'cash' ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-900 dark:text-neutral-50'}>
                    <polyline points={points(actual, key)} fill="none" className="stroke-current" strokeWidth="1.5" />
                    <polyline points={points(projected, key)} fill="none" className="stroke-current" strokeWidth="1.5" strokeDasharray="4 3" />
                </g>
            ))}
        </svg>
    );
}

/** from 以上 to 以下にある step の倍数。 */
function multiplesIn(from: number, to: number, step: number): number[] {
    const start = Math.ceil(from / step);
    return Array.from({ length: Math.max(0, Math.floor(to / step) - start + 1) }, (_, i) => (start + i) * step);
}
