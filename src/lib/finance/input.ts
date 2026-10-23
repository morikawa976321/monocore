import { monthNumber } from './month';
import { safeInteger, totalOf, validateEvent, type FinanceEvent, type Measurement } from './projection';

export interface EventDraft {
    id: string | null;
    name: string;
    start: string;
    end: string;
    cash: string;
    nisa: string;
    memo: string;
    /** NISA との振替(積立・売却)。立っていれば nisa は入力値ではなく cash の符号を返した値にする。 */
    transfer: boolean;
}
export interface MeasurementDraft { month: string; cash: string; nisa: string }

export function parseYen(text: string): number {
    const value = text.trim();
    if (!/^[+-]?(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)$/.test(value)) throw new Error('金額は半角の整数で入力してください（カンマ可）。');
    return safeInteger(Number(value.replaceAll(',', '')));
}

export function parseEvent({ transfer, ...draft }: EventDraft): FinanceEvent {
    const cash = parseYen(draft.cash);
    const event = { ...draft, name: draft.name.trim(), end: draft.end || null, cash, nisa: transfer ? opposite(cash) : parseYen(draft.nisa) };
    validateEvent(event);
    return event;
}

export function parseMeasurement(draft: MeasurementDraft): Measurement {
    monthNumber(draft.month);
    const row = { month: draft.month, cash: parseYen(draft.cash), nisa: parseYen(draft.nisa) };
    totalOf(row.cash, row.nisa);
    return row;
}

export function formatYen(value: number): string {
    return value.toLocaleString('ja-JP');
}

/**
 * NISA が動くのは積立・売却だけで、どちらも Cash との振替(NISA は市場変動 0 の前提)。
 * 振替の行は nisa = -cash になるので、計画の表は Cash の増減だけを出し、この行に印を付ける。
 */
export function isTransfer(event: Pick<FinanceEvent, 'cash' | 'nisa'>): boolean {
    return event.nisa !== 0 && event.nisa === opposite(event.cash);
}

function opposite(value: number): number {
    return value === 0 ? 0 : -value;
}

/** 正の値だけ + を付ける。0 は符号なし(2026-10-23 本人の指示)。 */
export function signedYen(value: number): string {
    return `${value > 0 ? '+' : ''}${formatYen(value)}`;
}
