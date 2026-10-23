import { Fragment, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { MILESTONES } from '@/src/lib/finance/constants';
import { formatYen, parseMeasurement, signedYen } from '@/src/lib/finance/input';
import { difference, totalOf } from '@/src/lib/finance/projection';
import { CARD, CARD_BODY, CARD_HEADER, GAP, LABEL, MUTED, NOTICE, NUM, TD, TH } from './card';
import type { FinanceState } from '@/src/hooks/useFinance';

/** 行をクリックで編集に入れる行の見た目(Reports の一覧の行と同じ hover)。 */
const CLICKABLE = 'cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors duration-150 ease-in-out';

/**
 * 「資産」のカード: 月末残高の表。実測(最新2行、古い分は畳む)→ 計画からの予測。
 * 記録の入力欄は常設しない。次の月の予測行(右端に＋)をクリックしたときだけ、その行が入力欄に変わる。
 * 実測の行はクリック(または鉛筆)で訂正・削除に入る。
 */
export function AssetsTable({ finance }: { finance: FinanceState }) {
    const [expanded, setExpanded] = useState(false);
    const { measurements, base, nextMonth, recordDraft, editingMonth, simulation, forecast } = finance;
    const older = measurements.slice(0, -2);
    // 編集中の月は、再取得で最新2行から外れても必ず表示する(編集欄と取消が消えないように)。
    const displayed = expanded ? measurements : measurements.filter((row, index) => index >= measurements.length - 2 || row.month === editingMonth);
    const busy = finance.saving || !!finance.eventDraft;
    const canEdit = !busy && !editingMonth && !finance.hasMeasurementDraft;
    const recording = finance.hasMeasurementDraft && !editingMonth;

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
    const measuredLabel = (month: string) => `実測${month === base?.month ? ' · 起点' : ''}${labels(month, false) && ` ／ ${labels(month, false)}`}`;
    const patch = (key: 'cash' | 'nisa', value: string) => finance.setMeasurementDraft({ ...recordDraft, [key]: value });
    const error = finance.measurementError || finance.forecastError || inputError;

    // 記録(または実測の訂正)の入力行。Ahead の目標の行と同じく、枠付きの Input を並べる。予測値は placeholder に出す。
    const editor = (
        <tr className="bg-neutral-100 dark:bg-neutral-800/50">
            <td className={`${TD} tabular-nums`}>{recordDraft.month}</td>
            <td className={`${TD} ${NUM} ${GAP}`}><Input aria-label="Cash 実測" inputMode="text" autoFocus placeholder={forecast ? formatYen(forecast.cash) : ''} value={recordDraft.cash} onChange={event => patch('cash', event.target.value)} disabled={busy} className="w-36 text-right tabular-nums" /></td>
            <td className={`${TD} ${NUM} ${GAP}`}><Input aria-label="NISA 実測" inputMode="text" placeholder={forecast ? formatYen(forecast.nisa) : ''} value={recordDraft.nisa} onChange={event => patch('nisa', event.target.value)} disabled={busy} className="w-36 text-right tabular-nums" /></td>
            <td className={`${TD} ${NUM} ${GAP}`}>{total}</td>
            <td className={`${TD} ${GAP}`} colSpan={2}>
                <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-sm tabular-nums ${MUTED}`}>予測 {forecast ? `${formatYen(forecast.cash)} / ${formatYen(forecast.nisa)}` : '算出不可'} → {diff}</span>
                    <Button color="primary" onClick={() => void finance.record()} disabled={invalid || busy || !!finance.forecastError}>{old ? '保存' : '記録'}</Button>
                    <Button color="secondary" onClick={finance.cancelMeasurement} disabled={finance.saving}>取消</Button>
                    {editingMonth && <Button color="danger" onClick={() => void finance.removeMeasurement()} disabled={finance.saving}>削除</Button>}
                </div>
                {old && <p className={`text-sm tabular-nums ${MUTED}`}>旧値 Cash {formatYen(old.cash)} / NISA {formatYen(old.nisa)}{editingMonth && ' · 削除するとこの月は予測に戻る'}</p>}
                {error && <p role="alert" className={NOTICE}>{error}</p>}
            </td>
        </tr>
    );

    const nextRowExists = simulation.rows.some(row => row.month === nextMonth);

    return (
        <section className={CARD} aria-labelledby="finance-assets">
            <div className={`${CARD_HEADER} flex items-center justify-between gap-2`}>
                <h2 id="finance-assets">資産 · 月末残高（円）</h2>
                {older.length > 0 && (
                    <Button color="link" size="link" disabled={!!editingMonth} aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="whitespace-nowrap" title={`${older[0].month} 〜 ${older.at(-1)!.month}`}>
                        {expanded ? '▾' : '▸'} 古い実測 {older.length} 行
                    </Button>
                )}
            </div>
            <div className={CARD_BODY}>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm leading-6 sm:text-base sm:leading-7">
                        <thead className={MUTED}>
                            <tr>
                                <th scope="col" className={`${TH} w-px`}>年月</th>
                                <th scope="col" className={`${TH} ${NUM} ${GAP} w-px`}>Cash</th>
                                <th scope="col" className={`${TH} ${NUM} ${GAP} w-px`}>NISA</th>
                                <th scope="col" className={`${TH} ${NUM} ${GAP} w-px`}>合計</th>
                                <th scope="col" className={`${TH} ${LABEL} w-full`}>イベント</th>
                                <th scope="col" className={`${TH} w-8`}><span className="sr-only">操作</span></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                            {displayed.map(row => (
                                <Fragment key={row.month}>
                                    {editingMonth === row.month ? editor : (
                                        <tr className={canEdit ? CLICKABLE : ''} onClick={() => { if (canEdit) finance.editMeasurement(row); }}>
                                            <td className={`${TD} tabular-nums`}>{row.month}</td>
                                            <td className={`${TD} ${NUM} ${GAP}`}>{formatYen(row.cash)}</td>
                                            <td className={`${TD} ${NUM} ${GAP}`}>{formatYen(row.nisa)}</td>
                                            <td className={`${TD} ${NUM} ${GAP}`}>{formatYen(totalOf(row.cash, row.nisa))}</td>
                                            <td className={`${TD} ${LABEL} ${MUTED}`} title={measuredLabel(row.month)}>{measuredLabel(row.month)}</td>
                                            <td className={`${TD} w-8 py-0 text-right`}>
                                                <Button color="ghost" size="icon" disabled={!canEdit} onClick={event => { event.stopPropagation(); finance.editMeasurement(row); }} aria-label={`${row.month} の実測を訂正`}>
                                                    <Pencil className="w-4 h-4" />
                                                </Button>
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            ))}
                            {/* 実測が1行も無い、次の月の予測行が無い、編集中の実測が別所で削除されて一覧から消えた: 入力行をここに出す */}
                            {(!base || (recording && !nextRowExists) || (editingMonth && !displayed.some(row => row.month === editingMonth))) && editor}
                            {simulation.rows.map(row => {
                                if (recording && row.month === nextMonth) return <Fragment key={row.month}>{editor}</Fragment>;
                                const isNext = row.month === nextMonth;
                                return (
                                    <tr key={row.month} className={`${MUTED} ${isNext && canEdit ? CLICKABLE : ''}`} onClick={() => { if (isNext && canEdit) finance.beginRecord(); }}>
                                        <td className={`${TD} tabular-nums`}>{row.month}</td>
                                        <td className={`${TD} ${NUM} ${GAP}`}>{formatYen(row.cash)}</td>
                                        <td className={`${TD} ${NUM} ${GAP}`}>{formatYen(row.nisa)}</td>
                                        <td className={`${TD} ${NUM} ${GAP}`}>{formatYen(row.total)}</td>
                                        <td className={`${TD} ${LABEL}`} title={labels(row.month, true) || undefined}>{labels(row.month, true)}</td>
                                        <td className={`${TD} w-8 py-0 text-right`}>
                                            {isNext && (
                                                <Button color="ghost" size="icon" disabled={!canEdit} onClick={event => { event.stopPropagation(); finance.beginRecord(); }} aria-label={`${row.month} の実測を記録`}>
                                                    <Plus className="w-4 h-4" />
                                                </Button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <p className={`mt-2 text-sm ${MUTED}`}>灰色の行は計画からの予測。次の月の行(＋)をクリックすると記録、実測の行をクリックすると訂正・削除。</p>
            </div>
        </section>
    );
}
