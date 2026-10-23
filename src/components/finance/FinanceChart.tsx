import type { Balance, Measurement } from '@/src/lib/finance/projection';
import { totalOf } from '@/src/lib/finance/projection';
import { monthNumber } from '@/src/lib/finance/month';

/** グリッドの間隔。月の通し番号は年×12 なので、60 の倍数がちょうど5の倍数の年の1月になる。 */
const GRID_MONTHS = 60;
const GRID_YEN = 5_000_000;
/** 線端ラベルどうしの最小間隔(viewBox の縦 96 に対する単位)。h-64 で約21px、text-sm の行高 20px を超える。 */
const LABEL_GAP = 8;
/** 縦横の目盛の文字。補助テキスト(MUTED)と同じ色。 */
const AXIS = 'text-sm tabular-nums text-neutral-700 dark:text-neutral-300';

type Key = 'total' | 'cash' | 'nisa';
type Row = Balance & { total: number };

/** 描く順(後ろほど上に重なる)。線の色と、線端ラベルの名前・文字色。 */
const SERIES: { key: Key; name: string; line: string; label: string }[] = [
    { key: 'nisa', name: 'NISA', line: 'text-neutral-400 dark:text-neutral-500', label: 'text-neutral-700 dark:text-neutral-300' },
    { key: 'cash', name: 'Cash', line: 'text-amber-600 dark:text-amber-400', label: 'text-amber-600 dark:text-amber-400' },
    { key: 'total', name: '合計', line: 'text-neutral-900 dark:text-neutral-50', label: 'text-neutral-900 dark:text-neutral-50' },
];

/**
 * 合計・Cash・NISA の折れ線(実測は実線、予測は破線、縦の点線は最新実測月)。
 * 縦横の薄いグリッドを敷き、同じ位置に目盛の数を置く(本人の指示 2026-10-23: 横は5年ごと、縦は500万円ごと、単位なし)。
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
        // 線は縦横比を固定せず伸ばすので、文字を SVG に入れると潰れる。ラベルは SVG の左・右・下の HTML 列に、viewBox の座標を % にして置く。
        // 縦横の目盛はグリッドの線と同じ位置にだけ付け、単位は書かない(本人の指示 2026-10-23。縦は万円、横は西暦)。
        <div className="flex flex-col h-64 sm:h-80">
            <div className="flex flex-1 min-h-0">
                <div className={`relative w-10 shrink-0 ${AXIS}`} aria-hidden="true">
                    {[0, ...levels].map(value => (
                        <span key={value} className="absolute right-2 -translate-y-1/2 whitespace-nowrap" style={{ top: `${y(value) / 96 * 100}%` }}>
                            {Math.round(value / 10_000).toLocaleString('ja-JP')}
                        </span>
                    ))}
                </div>
                <div className="flex-1 min-w-0">
                    <svg
                        viewBox="0 0 480 96"
                        preserveAspectRatio="none"
                        role="img"
                        aria-label={`月末資産の見通し。合計・Cash・NISA、実線は実測、破線は予測。縦の点線は最新実測月。${last.month} の見通しは ${SERIES.map(series => `${series.name} ${formatMan(last[series.key])}`).join('、')}。`}
                        className="block w-full h-full"
                    >
                        {/* 縦横比を固定しない SVG なので、線はすべて non-scaling-stroke にする。無いと線幅と破線の間隔が縦横で別々に伸び、水平な区間ほど太く見える */}
                        <g className="stroke-current text-neutral-200 dark:text-neutral-800" strokeWidth="1">
                            {levels.map(value => <line key={`y${value}`} x1="8" x2="472" y1={y(value)} y2={y(value)} vectorEffect="non-scaling-stroke" />)}
                            {years.map(serial => <line key={`x${serial}`} x1={xAt(serial)} x2={xAt(serial)} y1="8" y2="88" vectorEffect="non-scaling-stroke" />)}
                        </g>
                        <line x1="8" x2="472" y1={y(0)} y2={y(0)} className="stroke-current text-neutral-400 dark:text-neutral-600" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                        {/* 最新実測月の縦線は中立色。アンバーは Cash の線が使うので、同色にすると線と紛れる */}
                        <line x1={x(base.month)} x2={x(base.month)} y1="8" y2="88" strokeDasharray="2 3" className="stroke-current text-neutral-500" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                        {SERIES.map(series => (
                            <g key={series.key} className={series.line}>
                                <polyline points={points(actual, series.key)} fill="none" className="stroke-current" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                                <polyline points={points(projected, series.key)} fill="none" className="stroke-current" strokeWidth="2" strokeLinejoin="round" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
                            </g>
                        ))}
                    </svg>
                </div>
                <div className="relative w-24 sm:w-28 shrink-0" aria-hidden="true">
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
            {/* 下の目盛は左右のラベル列と同じ幅だけ内側に寄せ、SVG の幅に x を合わせる */}
            <div className={`relative h-6 ml-10 mr-24 sm:mr-28 ${AXIS}`} aria-hidden="true">
                {years.map(serial => (
                    <span key={serial} className="absolute top-1 -translate-x-1/2" style={{ left: `${xAt(serial) / 480 * 100}%` }}>
                        {serial / 12}
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
