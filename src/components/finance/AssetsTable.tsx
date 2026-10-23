import { Fragment, useState } from 'react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { MILESTONES } from '@/src/lib/finance/constants';
import { formatYen, parseMeasurement, signedYen } from '@/src/lib/finance/input';
import { difference, totalOf } from '@/src/lib/finance/projection';
import type { FinanceState } from '@/src/hooks/useFinance';

const CELL = 'px-2 py-2 border-b border-neutral-200 dark:border-neutral-800 whitespace-nowrap';
const NUMBER = `${CELL} text-right tabular-nums`;
const BASE_CELL = 'px-2 py-2 border-b border-dashed border-amber-500 dark:border-amber-400 whitespace-nowrap';

export function AssetsTable({ finance }: { finance: FinanceState }) {
    const [expanded, setExpanded] = useState(false);
    const { measurements, base, recordDraft, editingMonth, simulation, forecast } = finance;
    const older = measurements.slice(0, -2);
    // 編集中の月は、再取得で最新2行から外れても必ず表示する(編集欄と取消が消えないように)。
    const displayed = expanded ? measurements : measurements.filter((row, index) => index >= measurements.length - 2 || row.month === editingMonth);
    let total = '—';
    let diff = '差 算出不可';
    let invalid = false;
    let inputError: string | null = null;
    try {
        const actual = parseMeasurement(recordDraft);
        total = formatYen(totalOf(actual.cash, actual.nisa));
        if (forecast) diff = `差 ${signedYen(difference(actual.cash, forecast.cash))} / ${signedYen(difference(actual.nisa, forecast.nisa))}`;
    } catch (error) {
        invalid = true;
        if (recordDraft.cash || recordDraft.nisa) inputError = error instanceof Error ? error.message : '入力を確認してください。';
    }
    const old = measurements.find(row => row.month === recordDraft.month);
    const labels = (month: string, future: boolean) => [
        ...(future ? simulation.events : finance.events).filter(event => event.start === month && (event.end ?? event.start) === month).map(event => event.name),
        ...MILESTONES.filter(item => item.month === month).map(item => item.label),
        ...(simulation.summary?.firstNegative?.month === month ? ['Cash が負になる'] : []),
    ].filter(Boolean).join(' ／ ');
    const patch = (key: 'month' | 'cash' | 'nisa', value: string) => finance.setMeasurementDraft({ ...recordDraft, [key]: value });
    const editor = <tr className="bg-neutral-50 dark:bg-neutral-900">
        <td className={CELL}>{editingMonth ? recordDraft.month : <Input aria-label="記録する年月" placeholder="YYYY-MM" value={recordDraft.month} onChange={event => patch('month', event.target.value)} disabled={finance.saving || !!finance.eventDraft} className="w-32" />}</td>
        <td className={NUMBER}><Input aria-label="Cash 実測" inputMode="text" value={recordDraft.cash} onChange={event => patch('cash', event.target.value)} disabled={finance.saving || !!finance.eventDraft} className="w-36 tabular-nums" /></td>
        <td className={NUMBER}><Input aria-label="NISA 実測" inputMode="text" value={recordDraft.nisa} onChange={event => patch('nisa', event.target.value)} disabled={finance.saving || !!finance.eventDraft} className="w-36 tabular-nums" /></td>
        <td className={NUMBER}>{total}</td>
        <td className={CELL}>
            <div className="flex flex-wrap items-center gap-2">
                <span className="tabular-nums">予測 {forecast ? `${formatYen(forecast.cash)} / ${formatYen(forecast.nisa)}` : '算出不可'} → {diff}</span>
                <Button color="primary" onClick={() => void finance.record()} disabled={invalid || !!finance.eventDraft || finance.saving || !!finance.forecastError}>{old ? '保存' : '記録'}</Button>
                {(old || finance.hasMeasurementDraft) && <Button color="ghost" onClick={finance.cancelMeasurement} disabled={finance.saving}>取消</Button>}
            </div>
            {old && <p className="text-sm tabular-nums text-neutral-700 dark:text-neutral-300">旧値 Cash {formatYen(old.cash)} / NISA {formatYen(old.nisa)}</p>}
            {(finance.measurementError || finance.forecastError || inputError) && <p role="alert" className="text-sm text-amber-600 dark:text-amber-400">{finance.measurementError || finance.forecastError || inputError}</p>}
        </td>
    </tr>;
    return <section className="space-y-2" aria-labelledby="finance-assets">
        <div className="flex flex-wrap justify-between items-baseline gap-4">
            <h2 id="finance-assets" className="font-medium">資産 <span className="font-normal text-sm text-neutral-700 dark:text-neutral-300">月末残高（円）</span></h2>
            {older.length > 0 && <Button color="ghost" disabled={!!editingMonth} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? '▾' : '▸'} {older[0].month} 〜 {older.at(-1)!.month} の実測 {older.length} 行</Button>}
        </div>
        <div className="overflow-x-auto"><table className="w-full border-collapse">
            <thead className="bg-neutral-200 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200"><tr>
                {['年月', 'Cash', 'NISA', '合計', 'イベント'].map((label, index) => <th key={label} scope="col" className={`${index > 0 && index < 4 ? NUMBER : CELL} font-medium ${index > 0 && index < 4 ? '' : 'text-left'}`}>{label}</th>)}
            </tr></thead>
            <tbody>
                {displayed.map(row => {
                    const cell = row.month === base?.month ? BASE_CELL : CELL;
                    const number = `${cell} text-right tabular-nums`;
                    return <Fragment key={row.month}>{editingMonth === row.month ? editor : <tr onClick={() => finance.editMeasurement(row)}>
                        <td className={cell}><Button color="ghost" disabled={!!finance.eventDraft || finance.saving || !!editingMonth} onClick={event => { event.stopPropagation(); finance.editMeasurement(row); }} aria-label={`${row.month} の実測を訂正`}>{row.month}</Button></td>
                        <td className={number}>{formatYen(row.cash)}</td><td className={number}>{formatYen(row.nisa)}</td><td className={number}>{formatYen(totalOf(row.cash, row.nisa))}</td>
                        <td className={`${cell} text-neutral-700 dark:text-neutral-300`}>実測{row.month === base?.month ? ' · 起点' : ''}{labels(row.month, false) && ` ／ ${labels(row.month, false)}`}</td>
                    </tr>}</Fragment>;
                })}
                {/* 記録の入力行。編集中の実測が別所で削除されて一覧から消えたときも、ここに編集欄を出して取消できるようにする */}
                {(!editingMonth || !displayed.some(row => row.month === editingMonth)) && editor}
                {simulation.rows.map(row => <tr key={row.month} className="text-neutral-700 dark:text-neutral-300">
                    <td className={CELL}>{row.month}</td><td className={NUMBER}>{formatYen(row.cash)}</td><td className={NUMBER}>{formatYen(row.nisa)}</td><td className={NUMBER}>{formatYen(row.total)}</td><td className={CELL}>{labels(row.month, true)}</td>
                </tr>)}
            </tbody>
        </table></div>
        <p className="text-sm text-neutral-700 dark:text-neutral-300">灰色の行は計画からの予測。実測の年月をタップすると訂正できます。月を飛ばして記録できます。</p>
    </section>;
}
