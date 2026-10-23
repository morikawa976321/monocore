import type { Balance, Measurement } from '@/src/lib/finance/projection';
import { totalOf } from '@/src/lib/finance/projection';
import { monthNumber } from '@/src/lib/finance/month';

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
    const x = (month: string) => 8 + (monthNumber(month) - first) / span * 464;
    const y = (value: number) => 88 - (value - min) / range * 80;
    const points = (rows: Balance[], key: 'cash' | 'total') => rows.map(row => `${x(row.month)},${y(row[key])}`).join(' ');
    return <div className="w-full sm:w-120 max-w-full shrink-0 space-y-1">
        <svg viewBox="0 0 480 96" preserveAspectRatio="none" role="img" aria-label="月末資産の見通し。合計と Cash、実線は実測、破線は予測。縦の破線は最新実測月。"
            className="w-full h-24 rounded-sm border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
            <line x1="8" x2="472" y1={y(0)} y2={y(0)} className="stroke-current text-neutral-700 dark:text-neutral-300" strokeWidth="0.5" />
            <line x1={x(base.month)} x2={x(base.month)} y1="8" y2="88" strokeDasharray="3 3" className="stroke-current text-amber-600 dark:text-amber-400" />
            {(['total', 'cash'] as const).map(key => <g key={key} className={key === 'cash' ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-900 dark:text-neutral-50'}>
                <polyline points={points(actual, key)} fill="none" className="stroke-current" strokeWidth="1.5" />
                <polyline points={points(projected, key)} fill="none" className="stroke-current" strokeWidth="1.5" strokeDasharray="4 3" />
            </g>)}
        </svg>
        <p className="text-sm text-neutral-700 dark:text-neutral-300">
            {all[0].month} → {all.at(-1)!.month} · <span aria-hidden="true" className="inline-block align-middle w-4 border-t-2 border-neutral-900 dark:border-neutral-50" /> 合計 · <span aria-hidden="true" className="inline-block align-middle w-4 border-t-2 border-amber-600 dark:border-amber-400" /> Cash · 破線 = 予測
        </p>
    </div>;
}
