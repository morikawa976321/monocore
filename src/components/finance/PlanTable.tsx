import { Fragment } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Textarea } from '@/src/components/ui/Textarea';
import { isTransfer, signedYen } from '@/src/lib/finance/input';
import { visibleEvents } from '@/src/lib/finance/projection';
import { CARD, CARD_BODY, CARD_HEADER, EVEN, GAP, MUTED, NOTICE, NUM, TD, TH } from './card';
import { useRowNote } from './RowNote';
import type { EventDraft } from '@/src/lib/finance/input';
import type { FinanceEvent } from '@/src/lib/finance/projection';
import type { FinanceState } from '@/src/hooks/useFinance';

/** 行をクリックで編集に入れる行の見た目(Reports の一覧の行と同じ hover)。 */
const CLICKABLE = 'cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors duration-150 ease-in-out';

/**
 * NISA の増減は列を持たず、名前の後ろに添える(NISA が動く行は積立・売却の高々2行なので、全行に列を割かない)。
 * 振替なら向きだけ、Cash の逆でない行(将来の売却益など)は額をそのまま出して情報を落とさない。
 */
function nisaNote(event: Pick<FinanceEvent, 'cash' | 'nisa'>): string {
    if (isTransfer(event)) return event.cash < 0 ? '→ NISA' : '← NISA';
    return event.nisa ? `NISA ${signedYen(event.nisa)}` : '';
}

/** 「計画」のカード: イベント表。行をクリックで編集、末尾の「計画を追加」で下書き行。 */
export function PlanTable({ finance }: { finance: FinanceState }) {
    const { eventDraft: draft } = finance;
    const note = useRowNote();
    const rows = visibleEvents(finance.events, finance.base?.month);
    const canEdit = !draft && !finance.saving && !finance.editingMonth;
    const patch = (key: Exclude<keyof EventDraft, 'id' | 'transfer'>, value: string) => { if (draft) finance.setEventDraft({ ...draft, [key]: value }); };
    const error = finance.eventError || finance.simulation.error;

    // メモ列を持たないので、メモとボタンは2行目に全幅で置く。
    const editor = draft && (
        <>
        <tr className="bg-neutral-100 dark:bg-neutral-800/50">
            <td className={TD}><Input aria-label="イベント名" value={draft.name} onChange={event => patch('name', event.target.value)} disabled={finance.saving} className="min-w-40" /></td>
            <td className={TD}><Input aria-label="開始月" placeholder="YYYY-MM" value={draft.start} onChange={event => patch('start', event.target.value)} disabled={finance.saving} className="w-28 tabular-nums" /></td>
            <td className={TD}><Input aria-label="終了月（空なら単月）" placeholder="YYYY-MM" value={draft.end} onChange={event => patch('end', event.target.value)} disabled={finance.saving} className="w-28 tabular-nums" /></td>
            <td className={`${TD} ${NUM} ${GAP}`}>
                <Input aria-label="Cash 毎月の増減" value={draft.cash} onChange={event => patch('cash', event.target.value)} disabled={finance.saving} className="w-32 text-right tabular-nums" />
                {/* 外すと NISA は 0 に戻す(残すと、振替でない NISA の額として下の欄に出てしまう) */}
                <label className={`mt-1 flex items-center justify-end gap-1 text-sm ${MUTED}`}>
                    <input type="checkbox" checked={draft.transfer} onChange={event => finance.setEventDraft({ ...draft, transfer: event.target.checked, nisa: '0' })} disabled={finance.saving} className="accent-amber-500" />
                    NISA と振替
                </label>
                {!draft.transfer && draft.nisa.trim() !== '0' && (
                    <Input aria-label="NISA 毎月の増減" value={draft.nisa} onChange={event => patch('nisa', event.target.value)} disabled={finance.saving} className="mt-1 w-32 text-right tabular-nums" />
                )}
            </td>
            <td className={`${TD} w-8 hidden sm:table-cell`} />
        </tr>
        <tr className="bg-neutral-100 dark:bg-neutral-800/50">
            <td className="px-2 pt-1 pb-2" colSpan={5}>
                <Textarea aria-label="メモ" placeholder="メモ" value={draft.memo} onChange={event => patch('memo', event.target.value)} disabled={finance.saving} className="w-full resize-none" rows={2} />
                <div className="flex flex-wrap gap-2 mt-2">
                    <Button color="primary" onClick={() => void finance.saveEvent()} disabled={finance.saving || !!finance.simulation.error}>保存</Button>
                    <Button color="secondary" onClick={finance.cancelEvent} disabled={finance.saving}>取消</Button>
                    {draft.id && <Button color="danger" onClick={() => void finance.removeEvent()} disabled={finance.saving}>削除</Button>}
                </div>
                {error && <p role="alert" className={`mt-1 ${NOTICE}`}>{error}</p>}
            </td>
        </tr>
        </>
    );

    return (
        <section className={CARD} aria-labelledby="finance-plan">
            <h2 id="finance-plan" className={CARD_HEADER}>計画 · 1原因 = 1行 · 増減は毎月 · 終了が空ならその月だけ</h2>
            <div className={`${CARD_BODY} space-y-2`}>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm leading-6 sm:text-base sm:leading-7">
                        <thead className={MUTED}>
                            <tr>
                                <th scope="col" className={`${TH} ${EVEN}`}>イベント</th>
                                <th scope="col" className={`${TH} ${EVEN}`}>開始</th>
                                <th scope="col" className={`${TH} ${EVEN}`}>終了</th>
                                <th scope="col" className={`${TH} ${NUM} ${GAP} ${EVEN} pr-0 sm:pr-2`}>Cash 増減</th>
                                {/* 狭い画面ではゴミ箱の列を出さず、最後の Cash 列の右余白も詰める(表が横にはみ出す)。削除は行をタップした編集欄の「削除」でできる */}
                                <th scope="col" className={`${TH} w-8 pr-0 hidden sm:table-cell`}><span className="sr-only">操作</span></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                            {rows.map(row => draft?.id === row.id ? <Fragment key={row.id}>{editor}</Fragment> : (
                                <tr key={row.id} className={canEdit ? CLICKABLE : ''} onClick={() => { if (canEdit) finance.editEvent(row); }} {...note.rowProps(row.id, row.memo ?? '')}>
                                    <td className={TD}>
                                        {row.name || '（名前なし）'}
                                        {nisaNote(row) && <span className={`ml-2 text-sm ${MUTED}`}>{nisaNote(row)}</span>}
                                        {note.hint(row.memo ?? '')}
                                    </td>
                                    <td className={`${TD} tabular-nums`}>{row.start}</td>
                                    <td className={`${TD} tabular-nums`}>{row.end}</td>
                                    <td className={`${TD} ${NUM} ${GAP} pr-0 sm:pr-2`}>{signedYen(row.cash)}</td>
                                    <td className={`${TD} w-8 py-0 pr-0 text-right hidden sm:table-cell`}>
                                        <Button color="ghost" size="icon" disabled={!canEdit} onClick={event => { event.stopPropagation(); void finance.removeEvent(row.id); }} aria-label={`${row.name || '（名前なし）'} を削除`} title="削除">
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                            {/* 新規の下書き、または編集中の行が再取得で一覧から消えた(別所で削除・非表示になった)ときも編集欄を出し、取消できるようにする */}
                            {draft && (!draft.id || !rows.some(row => row.id === draft.id)) && editor}
                        </tbody>
                    </table>
                </div>
                {/* 行の削除ボタンの失敗は編集欄が無いのでここに出す */}
                {!draft && finance.eventError && <p role="alert" className={NOTICE}>{finance.eventError}</p>}
                {!rows.length && !draft && <p className={MUTED}>表示する計画はありません。</p>}
                <Button color="secondary" onClick={() => finance.editEvent()} disabled={!canEdit}>
                    <Plus className="w-4 h-4" />
                    計画を追加
                </Button>
            </div>
            {note.tooltip}
        </section>
    );
}
