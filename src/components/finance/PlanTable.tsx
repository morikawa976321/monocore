import { Fragment } from 'react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Textarea } from '@/src/components/ui/Textarea';
import { signedYen } from '@/src/lib/finance/input';
import { visibleEvents } from '@/src/lib/finance/projection';
import type { EventDraft } from '@/src/lib/finance/input';
import type { FinanceState } from '@/src/hooks/useFinance';

const CELL = 'px-2 py-2 border-b border-neutral-200 dark:border-neutral-800';

export function PlanTable({ finance }: { finance: FinanceState }) {
    const { eventDraft: draft } = finance;
    const rows = visibleEvents(finance.events, finance.base?.month);
    // Keep an edited row reachable even when its new end month is in the past.
    const patch = (key: keyof EventDraft, value: string) => { if (draft) finance.setEventDraft({ ...draft, [key]: value }); };
    const editor = draft && <tr className="bg-neutral-50 dark:bg-neutral-900">
        <td className={CELL}><Input aria-label="イベント名" value={draft.name} onChange={event => patch('name', event.target.value)} disabled={finance.saving} className="min-w-40" /></td>
        <td className={CELL}><Input aria-label="開始月" placeholder="YYYY-MM" value={draft.start} onChange={event => patch('start', event.target.value)} disabled={finance.saving} className="w-32" /></td>
        <td className={CELL}><Input aria-label="終了月（空なら単月）" placeholder="YYYY-MM" value={draft.end} onChange={event => patch('end', event.target.value)} disabled={finance.saving} className="w-32" /></td>
        <td className={CELL}><Input aria-label="Cash 毎月の増減" value={draft.cash} onChange={event => patch('cash', event.target.value)} disabled={finance.saving} className="w-36 tabular-nums" /></td>
        <td className={CELL}><Input aria-label="NISA 毎月の増減" value={draft.nisa} onChange={event => patch('nisa', event.target.value)} disabled={finance.saving} className="w-36 tabular-nums" /></td>
        <td className={CELL}>
            <Textarea aria-label="メモ" value={draft.memo} onChange={event => patch('memo', event.target.value)} disabled={finance.saving} className="min-w-64" rows={2} />
            <div className="flex gap-2 mt-2">
                <Button color="primary" onClick={() => void finance.saveEvent()} disabled={finance.saving || !!finance.simulation.error}>保存</Button>
                <Button color="ghost" onClick={finance.cancelEvent} disabled={finance.saving}>取消</Button>
                {draft.id && <Button color="danger" onClick={() => void finance.removeEvent()} disabled={finance.saving}>削除</Button>}
            </div>
            {(finance.eventError || finance.simulation.error) && <p role="alert" className="text-sm text-amber-600 dark:text-amber-400">{finance.eventError || finance.simulation.error}</p>}
        </td>
    </tr>;
    return <section className="space-y-2" aria-labelledby="finance-plan">
        <div className="flex justify-between items-baseline gap-4">
            <h2 id="finance-plan" className="font-medium">計画 <span className="text-sm font-normal text-neutral-700 dark:text-neutral-300">1原因 = 1行 · 増減は毎月 · 終了が空ならその月だけ</span></h2>
            <Button color="ghost" onClick={() => finance.editEvent()} disabled={!!draft || finance.saving || !!finance.editingMonth}>+ 追加</Button>
        </div>
        <div className="overflow-x-auto"><table className="w-full border-collapse"><thead className="bg-neutral-200 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200"><tr>
            {['イベント', '開始', '終了', 'Cash 増減', 'NISA 増減', 'メモ'].map((label, index) => <th scope="col" key={label} className={`${CELL} font-medium whitespace-nowrap ${index === 3 || index === 4 ? 'text-right' : 'text-left'}`}>{label}</th>)}
        </tr></thead><tbody>
            {rows.map(row => draft?.id === row.id ? <Fragment key={row.id}>{editor}</Fragment> : <tr key={row.id} onClick={() => finance.editEvent(row)}>
                <td className={CELL}><Button color="ghost" disabled={!!draft || finance.saving || !!finance.editingMonth} onClick={event => { event.stopPropagation(); finance.editEvent(row); }}>{row.name || '（名前なし）'}</Button></td>
                <td className={`${CELL} whitespace-nowrap tabular-nums`}>{row.start}</td><td className={`${CELL} whitespace-nowrap tabular-nums`}>{row.end}</td>
                <td className={`${CELL} text-right tabular-nums`}>{signedYen(row.cash)}</td><td className={`${CELL} text-right tabular-nums`}>{signedYen(row.nisa)}</td><td className={`${CELL} text-neutral-700 dark:text-neutral-300`}>{row.memo}</td>
            </tr>)}
            {/* 新規の下書き、または編集中の行が再取得で一覧から消えた(別所で削除・非表示になった)ときも編集欄を出し、取消できるようにする */}
            {draft && (!draft.id || !rows.some(row => row.id === draft.id)) && editor}
        </tbody></table></div>
        {!rows.length && !draft && <p className="text-sm text-neutral-700 dark:text-neutral-300">表示する計画はありません。「+ 追加」でイベントを登録できます。</p>}
        <p className="text-sm text-neutral-700 dark:text-neutral-300">行をタップして編集。下書きは上の表と折れ線へ即時反映されます。記録した月までに終わった行は非表示になります（データは残ります）。</p>
    </section>;
}
