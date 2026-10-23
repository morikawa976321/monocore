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
}
export interface MeasurementDraft { month: string; cash: string; nisa: string }

export function parseYen(text: string): number {
    const value = text.trim();
    if (!/^[+-]?(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)$/.test(value)) throw new Error('金額は半角の整数で入力してください（カンマ可）。');
    return safeInteger(Number(value.replaceAll(',', '')));
}

export function parseEvent(draft: EventDraft): FinanceEvent {
    const event = { ...draft, name: draft.name.trim(), end: draft.end || null, cash: parseYen(draft.cash), nisa: parseYen(draft.nisa) };
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

/** 正の値だけ + を付ける。0 は符号なし(2026-10-23 本人の指示)。 */
export function signedYen(value: number): string {
    return `${value > 0 ? '+' : ''}${formatYen(value)}`;
}
