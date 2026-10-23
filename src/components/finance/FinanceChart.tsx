import type { Balance, Measurement } from '@/src/lib/finance/projection';
import { totalOf } from '@/src/lib/finance/projection';
import { monthNumber } from '@/src/lib/finance/month';

/** グリッドの間隔。月の通し番号は年×12 なので、60 の倍数がちょうど5の倍数の年の1月になる。 */
const GRID_MONTHS = 60;
const GRID_YEN = 5_000_000;
/** 線端ラベルどうしの最小間隔(viewBox の縦 96 に対する単位)。h-64 で約21px、text-sm の行高 20px を超える。 */
const LABEL_GAP = 8;

type Key = 'total' | 'cash' | 'nisa';
type Row = Balance & { total: number };

/** 描く順(後ろほど上に重なる)。線の色と、線端ラベルの名前・文字色。 */
const SERIES: { key: Key; name: string; line: string; label: string }[] = [
    { key: 'nisa', name: 'NISA', line: 'text-neutral-400 dark:text-neutral-500', label: 'text-neutral-700 dark:text-neutral-300' },
    { key: 'cash', name: 'Cash', line: 'text-amber-600 dark:text-amber-400', label: 'text-amber-600 dark:text-amber-400' },
    { key: 'total', name: '合計', line: 'text-neutral-900 dark:text-neutral-50', label: 'text-neutral-900 dark:text-neutral-50' },
];

/**
 * 合計・Cash・NISA の折れ線(実測は実線、予測は破線、縦の破線は最新実測月)。
 * 目盛の代わりに縦横の薄いグリッドを敷く(本人の指示 2026-10-23: 横は5年ごと、縦は500万円ごと)。
 * 凡例は持たず、線の右端に系列名と終点の額を置く(本人の指示 2026-10-23: 3本を見分けるため)。
 */
export function FinanceChart({ measurements, future }: { measurements: Measurement[]; future: Balance[] }) {
    const actual: Row[] = [...measurements].sort((a, b) => a.month.localeCompare(b.month)).map(row => ({ ...row, total: totalOf(row.cash, row.nisa) }));
    const base = actual.at(-1);
    const projected: Row[] = base ? [base, ...future] : [];
    const all: Row[] = [...actual, ...future];
    if (!base || !all.length) return null;
    const last = all.at(-1)!;
    const first = monthNumber(all[0].month);
    const span = Math.max(1, monthNumber(last.month) - first);
    const values = all.flatMap(row => [row.cash, row.nisa, row.total]);
    const min = values.reduce((bound, value) => Math.min(bound, value), 0);
    const max = values.reduce((bound, value) => Math.max(bound, value), 0);
    const range = max - min || 1;
    const xAt = (serial: number) => 8 + (serial - first) / span * 464;
    const x = (month: string) => xAt(monthNumber(month));
    const y = (value: number) => 88 - (value - min) / range * 80;
    const points = (rows: Row[], key: Key) => rows.map(row => `${x(row.month)},${y(row[key])}`).join(' ');
    const levels = multiplesIn(min, max, GRID_YEN).filter(value => value !== 0);
    const years = multiplesIn(first + 1, first + span, GRID_MONTHS);
    const labelTops = spread(SERIES.map(series => y(last[series.key])), LABEL_GAP, 96);
    return (
        // 線は縦横比を固定せず伸ばすので、文字を SVG に入れると潰れる。ラベルは右の HTML 列に、viewBox の y を % にして置く
        <div className="flex h-64 sm:h-80">
            <svg
                viewBox="0 0 480 96"
                preserveAspectRatio="none"
                role="img"
                aria-label={`月末資産の見通し。合計・Cash・NISA、実線は実測、破線は予測。縦の破線は最新実測月。${last.month} の見通しは ${SERIES.map(series => `${series.name} ${formatMan(last[series.key])}`).join('、')}。`}
                className="block flex-1 min-w-0 h-full"
            >
                {/* 縦横比を固定しない SVG なので、線幅は non-scaling-stroke で画面上の 1px に揃える */}
                <g className="stroke-current text-neutral-200 dark:text-neutral-800" strokeWidth="1">
                    {levels.map(value => <line key={`y${value}`} x1="8" x2="472" y1={y(value)} y2={y(value)} vectorEffect="non-scaling-stroke" />)}
                    {years.map(serial => <line key={`x${serial}`} x1={xAt(serial)} x2={xAt(serial)} y1="8" y2="88" vectorEffect="non-scaling-stroke" />)}
                </g>
                <line x1="8" x2="472" y1={y(0)} y2={y(0)} className="stroke-current text-neutral-400 dark:text-neutral-600" strokeWidth="1" />
                <line x1={x(base.month)} x2={x(base.month)} y1="8" y2="88" strokeDasharray="3 3" className="stroke-current text-amber-600 dark:text-amber-400" />
                {SERIES.map(series => (
                    <g key={series.key} className={series.line}>
                        <polyline points={points(actual, series.key)} fill="none" className="stroke-current" strokeWidth="1.5" />
                        <polyline points={points(projected, series.key)} fill="none" className="stroke-current" strokeWidth="1.5" strokeDasharray="4 3" />
                    </g>
                ))}
            </svg>
            <div className="relative w-28 shrink-0" aria-hidden="true">
                {SERIES.map((series, i) => (
                    <span
                        key={series.key}
                        className={`absolute left-2 -translate-y-1/2 whitespace-nowrap text-sm tabular-nums ${series.label}`}
                        style={{ top: `${labelTops[i] / 96 * 100}%` }}
                    >
                        {series.name} {formatMan(last[series.key])}
                    </span>
                ))}
            </div>
        </div>
    );
}

/** from 以上 to 以下にある step の倍数。 */
function multiplesIn(from: number, to: number, step: number): number[] {
    const start = Math.ceil(from / step);
    return Array.from({ length: Math.max(0, Math.floor(to / step) - start + 1) }, (_, i) => (start + i) * step);
}

/** 並び順を保ったまま、隣どうしが gap 以上離れ、gap/2〜height-gap/2 に収まるよう位置をずらす(入力と同じ順で返す)。 */
function spread(positions: number[], gap: number, height: number): number[] {
    const order = positions.map((position, index) => ({ position, index })).sort((a, b) => a.position - b.position);
    for (let i = 1; i < order.length; i++) order[i].position = Math.max(order[i].position, order[i - 1].position + gap);
    for (let i = order.length - 1; i >= 0; i--) order[i].position = Math.min(order[i].position, i === order.length - 1 ? height - gap / 2 : order[i + 1].position - gap);
    const result: number[] = [];
    for (const { position, index } of order) result[index] = Math.max(position, gap / 2);
    return result;
}

function formatMan(value: number): string {
    return `${Math.round(value / 10_000).toLocaleString('ja-JP')}万`;
}
