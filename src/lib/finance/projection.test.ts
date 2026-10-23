import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { addMonths, fromMonthDate, monthFromNumber, monthNumber, toMonthDate } from './month';
import { parseMeasurement, parseYen } from './input';
import { ASSUMPTIONS } from './constants';
import { forecastAt, horizonFor, project, summarize, totalOf, visibleEvents, type FinanceEvent } from './projection';

const base = { month: '2026-01', cash: 100, nisa: 50 };
const end = '2027-12';
function event(start: string, finish: string | null, cash: number, nisa = 0): FinanceEvent {
    return { name: 'synthetic', start, end: finish, cash, nisa };
}
const eventArb = fc.record({ offset: fc.integer({ min: -3, max: 12 }), length: fc.integer({ min: 0, max: 8 }), cash: fc.integer({ min: -10000, max: 10000 }), nisa: fc.integer({ min: -10000, max: 10000 }) })
    .map(row => event(addMonths(base.month, row.offset), addMonths(base.month, row.offset + row.length), row.cash, row.nisa));
const eventsArb = fc.array(eventArb, { maxLength: 12 });

describe('finance projection: hand calculations', () => {
    it('adds monthly deltas inclusively, handles one-off events, and skips the base month', () => {
        expect(project([base], [event('2026-01', '2026-03', -10, 2), event('2026-02', null, 30)], '2026-04')).toEqual([
            { month: '2026-02', cash: 120, nisa: 52, total: 172 },
            { month: '2026-03', cash: 110, nisa: 54, total: 164 },
            { month: '2026-04', cash: 110, nisa: 54, total: 164 },
        ]);
    });
    it('uses the latest measurement even when input is unordered', () => {
        expect(project([{ month: '2026-03', cash: 500, nisa: 600 }, base], [], '2026-04')[0]).toEqual({ month: '2026-04', cash: 500, nisa: 600, total: 1100 });
    });
    it('compares against strictly earlier measurements on overwrite and across skipped months', () => {
        const measurements = [base, { month: '2026-04', cash: 999, nisa: 999 }];
        const events = [event('2026-02', '2026-04', -10, 5)];
        expect(forecastAt(measurements, events, '2026-04')).toEqual({ month: '2026-04', cash: 70, nisa: 65, total: 135 });
        expect(measurements).toHaveLength(2);
        expect(forecastAt(measurements, events, '2026-01')).toBeNull();
    });
    it('has no projection or comparison without a starting measurement', () => {
        expect(project([], [])).toEqual([]);
        expect(forecastAt([], [], '2026-02')).toBeNull();
        expect(summarize([], []).minimumCash).toBeNull();
    });
    it('extends the horizon to the latest event end (including a single month)', () => {
        expect(horizonFor([])).toBe('2042-03');
        expect(horizonFor([event('2043-01', '2045-03', 1)])).toBe('2045-03');
        expect(horizonFor([event('2046-01', null, 1)])).toBe('2046-01');
        expect(project([base], []).at(-1)?.month).toBe('2042-03');
    });
    it('hides ended events only when measurements exist and sorts by start', () => {
        const events = [event('2026-03', null, 1), event('2025-12', '2026-01', 1), event('2026-01', '2026-02', 1)];
        expect(visibleEvents(events, base.month)).toEqual([events[2], events[0]]);
        expect(visibleEvents(events)).toHaveLength(3);
    });
    it('summarizes milestones, first negative cash, minimum cash, and assumptions', () => {
        const result = summarize([{ month: '2028-01', cash: 10, nisa: 100 }], [event('2028-02', '2028-03', -6, 1)]);
        expect(result.milestones.map(item => item.balance?.total)).toEqual([100, 100]);
        expect(result.firstNegative?.month).toBe('2028-03');
        expect(result.minimumCash?.cash).toBe(-2);
        expect(result.assumptions).toEqual(ASSUMPTIONS);
    });
    it('does not invent past milestones, but uses actual values at recorded milestones', () => {
        const result = summarize([{ month: '2028-03', cash: 1, nisa: 2 }, { month: '2043-01', cash: 3, nisa: 4 }], []);
        expect(result.milestones[0].balance?.total).toBe(3);
        expect(result.milestones[1].balance).toBeNull();
    });
    it('validates months and performs year rollover without timezone conversions', () => {
        expect(addMonths('2026-12', 1)).toBe('2027-01');
        expect(addMonths('2027-01', -1)).toBe('2026-12');
        expect(fromMonthDate(toMonthDate('2028-02'))).toBe('2028-02');
        expect(monthFromNumber(monthNumber('0001-01'))).toBe('0001-01');
        for (const month of ['2026-00', '2026-13', '26-01', '2026-1', '0000-01']) expect(() => monthNumber(month)).toThrow();
        expect(() => fromMonthDate('2026-01-02')).toThrow();
        expect(() => project([base], [event('2026-03', '2026-02', 1)])).toThrow();
    });
    it('parses signed integer yen with commas and rejects rounding or unsafe inputs', () => {
        expect(parseYen('-1,234')).toBe(-1234);
        expect(parseYen('+1234')).toBe(1234);
        expect(parseYen('9,007,199,254,740,991')).toBe(Number.MAX_SAFE_INTEGER);
        for (const value of ['', '1.1', '１', '1e3', '1,23', '9,007,199,254,740,992']) expect(() => parseYen(value)).toThrow();
        expect(() => parseMeasurement({ month: '2026-02', cash: '9007199254740991', nisa: '1' })).toThrow();
    });
    it('rejects overflow in cash, NISA, and total without order-dependent intermediate overflow', () => {
        const max = Number.MAX_SAFE_INTEGER;
        expect(() => totalOf(max, 1)).toThrow();
        expect(() => project([{ ...base, cash: max, nisa: 0 }], [event('2026-02', null, 1)], '2026-02')).toThrow();
        expect(() => project([{ ...base, cash: 0, nisa: max }], [event('2026-02', null, 0, 1)], '2026-02')).toThrow();
        expect(project([{ ...base, cash: max, nisa: 0 }], [event('2026-02', null, 1), event('2026-02', null, -1)], '2026-02')[0].cash).toBe(max);
    });
});

describe('finance projection: properties (100 generated cases each)', () => {
    it('1: event order does not affect balances', () => {
        fc.assert(fc.property(eventsArb, fc.integer(), (events, seed) => {
            const shuffled = fc.sample(fc.shuffledSubarray(events, { minLength: events.length, maxLength: events.length }), { seed, numRuns: 1 })[0];
            expect(project([base], shuffled, end)).toEqual(project([base], events, end));
        }), { numRuns: 100 });
    });
    it('2: null end equals start=end', () => {
        fc.assert(fc.property(eventArb, row => {
            expect(project([base], [{ ...row, end: null }], end)).toEqual(project([base], [{ ...row, end: row.start }], end));
        }), { numRuns: 100 });
    });
    it('3: splitting an interval without overlap preserves balances', () => {
        fc.assert(fc.property(eventArb, fc.integer({ min: 1, max: 4 }), (row, split) => {
            const finish = addMonths(row.start, split + 3);
            const divided = [{ ...row, end: addMonths(row.start, split - 1) }, { ...row, start: addMonths(row.start, split), end: finish }];
            expect(project([base], divided, end)).toEqual(project([base], [{ ...row, end: finish }], end));
        }), { numRuns: 100 });
    });
    it('4: removing events ended at or before the base preserves the future', () => {
        fc.assert(fc.property(eventsArb, events => {
            expect(project([base], visibleEvents(events, base.month), end)).toEqual(project([base], events, end));
        }), { numRuns: 100 });
    });
    it('5: a cash to NISA transfer preserves each monthly total', () => {
        fc.assert(fc.property(eventsArb, fc.integer({ min: -10000, max: 10000 }), (events, transfer) => {
            expect(project([base], [...events, event('2026-02', end, -transfer, transfer)], end).map(row => row.total))
                .toEqual(project([base], events, end).map(row => row.total));
        }), { numRuns: 100 });
    });
    it('6: recording a projected value preserves all later balances', () => {
        fc.assert(fc.property(eventsArb, fc.integer({ min: 0, max: 10 }), (events, index) => {
            const before = project([base], events, end);
            const measured = before[index];
            expect(project([base, measured], events, end)).toEqual(before.slice(index + 1));
        }), { numRuns: 100 });
    });
    it('7: correcting an older measurement does not change the future', () => {
        fc.assert(fc.property(eventsArb, fc.integer({ min: -100000, max: 100000 }), (events, cash) => {
            const latest = { month: '2026-05', cash: 200, nisa: 300 };
            expect(project([{ ...base, cash }, latest], events, end)).toEqual(project([base, latest], events, end));
        }), { numRuns: 100 });
    });
});
