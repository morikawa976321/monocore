import { FinanceChart } from './FinanceChart';
import { CARD, CARD_BODY, CARD_HEADER, MUTED, NOTICE } from './card';
import { formatYen } from '@/src/lib/finance/input';
import { totalOf } from '@/src/lib/finance/projection';
import { ASSUMPTIONS } from '@/src/lib/finance/constants';
import type { FinanceState } from '@/src/hooks/useFinance';

/** 「見通し」のカード: 起点・節目・Cash が負になる月の要約と、補助の折れ線。 */
export function FinanceHeader({ finance }: { finance: FinanceState }) {
    const { base, simulation, measurements } = finance;
    const summary = simulation.summary;
    return (
        <section className={CARD} aria-labelledby="finance-outlook">
            <h2 id="finance-outlook" className={CARD_HEADER}>見通し</h2>
            <div className={`${CARD_BODY} flex flex-wrap items-start gap-x-6 gap-y-2`}>
                <div className="min-w-0 flex-1 basis-80 space-y-1">
                    <p className="tabular-nums text-neutral-900 dark:text-neutral-50">
                        {base
                            ? `${base.month} 末の実測 · Cash ${formatYen(base.cash)} · NISA ${formatYen(base.nisa)} · 合計 ${formatYen(totalOf(base.cash, base.nisa))}`
                            : '最初の月末残高を記録すると、見通しを表示します。'}
                    </p>
                    {summary && (
                        <p className="tabular-nums text-neutral-900 dark:text-neutral-50">
                            {summary.milestones.map(item => `${item.month} ${item.label} ${item.balance ? formatYen(item.balance.total) : '算出不可'}`).join(' · ')}
                            {base && ` · ${summary.firstNegative ? `Cash は ${summary.firstNegative.month} に負になる` : '見通しの期間内に Cash が負になる月なし'}`}
                        </p>
                    )}
                    {summary?.minimumCash && (
                        <p className={`text-sm tabular-nums ${MUTED}`}>Cash の最小 {formatYen(summary.minimumCash.cash)} 円（{summary.minimumCash.month}）</p>
                    )}
                    {finance.eventDraft && <p className={NOTICE}>計画の下書きでシミュレーション中</p>}
                    <p className={`text-sm ${MUTED}`}>前提: {ASSUMPTIONS.join(' · ')}</p>
                </div>
                <FinanceChart measurements={measurements} future={simulation.rows} />
            </div>
        </section>
    );
}
