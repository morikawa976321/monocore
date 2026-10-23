import { ASSUMPTIONS, DISPLAY_MONTHS, MILESTONES, MIN_HORIZON } from './constants';
import { addMonths, currentMonth, monthFromNumber, monthNumber } from './month';

export interface FinanceEvent {
    name: string;
    start: string;
    end: string | null;
    cash: number;
    nisa: number;
    memo?: string;
}
export interface Measurement { month: string; cash: number; nisa: number }
export interface Balance extends Measurement { total: number }

export function safeInteger(value: number): number {
    if (!Number.isSafeInteger(value)) throw new Error('金額は安全な整数円の範囲で入力してください。');
    return value;
}

function checked(value: bigint): number {
    return safeInteger(Number(value));
}

export function totalOf(cash: number, nisa: number): number {
    return checked(BigInt(safeInteger(cash)) + BigInt(safeInteger(nisa)));
}

export function difference(actual: number, forecast: number): number {
    return checked(BigInt(safeInteger(actual)) - BigInt(safeInteger(forecast)));
}

export function validateEvent(event: FinanceEvent): void {
    const start = monthNumber(event.start);
    const end = monthNumber(event.end ?? event.start);
    if (end < start) throw new Error('終了月は開始月以降にしてください。');
    safeInteger(event.cash);
    safeInteger(event.nisa);
}

export function latestMeasurement(measurements: readonly Measurement[], before?: string): Measurement | null {
    if (before) monthNumber(before);
    let latest: Measurement | null = null;
    for (const row of measurements) {
        monthNumber(row.month);
        totalOf(row.cash, row.nisa);
        if ((!before || row.month < before) && (!latest || row.month > latest.month)) latest = row;
    }
    return latest;
}

export function horizonFor(events: readonly FinanceEvent[]): string {
    return events.reduce((end, event) => {
        validateEvent(event);
        const last = event.end ?? event.start;
        return last > end ? last : end;
    }, MIN_HORIZON);
}

export function visibleEvents<T extends FinanceEvent>(events: readonly T[], latestMonth?: string | null): T[] {
    return events.filter(event => !latestMonth || (event.end ?? event.start) > latestMonth)
        .sort((a, b) => a.start.localeCompare(b.start));
}

/** 予測のうち、表と折れ線に出す分(当月から DISPLAY_MONTHS ヶ月先まで)。 */
export function displayedRows<T extends { month: string }>(rows: readonly T[], from = currentMonth()): T[] {
    const end = addMonths(from, DISPLAY_MONTHS);
    return rows.filter(row => row.month <= end);
}

/** Only future balances are derived; measurements are never filled in or rewritten. */
export function project(measurements: readonly Measurement[], events: readonly FinanceEvent[], end = horizonFor(events)): Balance[] {
    const last = monthNumber(end);
    events.forEach(validateEvent);
    const base = latestMeasurement(measurements);
    if (!base) return [];
    let cash = BigInt(base.cash);
    let nisa = BigInt(base.nisa);
    const rows: Balance[] = [];
    for (let index = monthNumber(base.month) + 1; index <= last; index++) {
        const month = monthFromNumber(index);
        for (const event of events) {
            if (event.start <= month && month <= (event.end ?? event.start)) {
                cash += BigInt(event.cash);
                nisa += BigInt(event.nisa);
            }
        }
        rows.push({ month, cash: checked(cash), nisa: checked(nisa), total: checked(cash + nisa) });
    }
    return rows;
}

/** Re-recording a month ignores that month's previous measurement. */
export function forecastAt(measurements: readonly Measurement[], events: readonly FinanceEvent[], month: string): Balance | null {
    const base = latestMeasurement(measurements, month);
    if (!base) return null;
    return project([base], events, month).at(-1) ?? null;
}

export function summarize(measurements: readonly Measurement[], events: readonly FinanceEvent[]) {
    const base = latestMeasurement(measurements);
    const future = project(measurements, events);
    const rows = base ? [{ ...base, total: totalOf(base.cash, base.nisa) }, ...future] : [];
    return {
        base,
        milestones: MILESTONES.map(milestone => {
            const row = measurements.find(row => row.month === milestone.month) ?? future.find(row => row.month === milestone.month);
            return { ...milestone, balance: row ? { ...row, total: totalOf(row.cash, row.nisa) } : null };
        }),
        firstNegative: rows.find(row => row.cash < 0) ?? null,
        minimumCash: rows.reduce<Balance | null>((min, row) => !min || row.cash < min.cash ? row : min, null),
        assumptions: ASSUMPTIONS,
    };
}
