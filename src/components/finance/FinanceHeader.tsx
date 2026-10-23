import { FinanceChart } from './FinanceChart';
import { formatYen } from '@/src/lib/finance/input';
import { totalOf } from '@/src/lib/finance/projection';
import type { FinanceState } from '@/src/hooks/useFinance';

export function FinanceHeader({ finance }: { finance: FinanceState }) {
    const { base, simulation, measurements } = finance;
    const summary = simulation.summary;
    return <header className="flex flex-wrap justify-between items-start gap-4">
        <div className="flex-1 min-w-64 space-y-1">
            <h1 className="text-lg font-medium">finance</h1>
            <p className="tabular-nums text-neutral-800 dark:text-neutral-200">{base
                ? `${base.month} 末の実測 · Cash ${formatYen(base.cash)} · NISA ${formatYen(base.nisa)} · 合計 ${formatYen(totalOf(base.cash, base.nisa))}`
                : '最初の月末残高を記録すると、見通しを表示します。'}</p>
            <p className="tabular-nums text-neutral-800 dark:text-neutral-200">
                {summary?.milestones.map(item => `${item.month} ${item.label} ${item.balance ? formatYen(item.balance.total) : '算出不可'}`).join(' · ')}
                {base && ` · ${summary?.firstNegative ? `Cash は ${summary.firstNegative.month} に負になる` : '見通しの期間内に Cash が負になる月なし'}`}
            </p>
            {summary?.minimumCash && <p className="text-sm tabular-nums text-neutral-700 dark:text-neutral-300">Cash の最小 {formatYen(summary.minimumCash.cash)} 円（{summary.minimumCash.month}）</p>}
            {finance.eventDraft && <p className="text-sm text-amber-600 dark:text-amber-400">計画の下書きでシミュレーション中</p>}
        </div>
        <FinanceChart measurements={measurements} future={simulation.rows} />
    </header>;
}
