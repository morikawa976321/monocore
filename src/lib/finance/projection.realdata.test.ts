import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { project, totalOf, type FinanceEvent, type Measurement } from './projection';

interface Fixture {
    events: { name: string; start: string; end: string; cash: number; nisa: number; memo: string }[];
    measurements: Measurement[];
    expected: Measurement[];
}

const fixturePath = process.env.FINANCE_FIXTURE;
it.skipIf(!fixturePath)('matches every supplied real-data expected row (FINANCE_FIXTURE)', () => {
    const fixture: Fixture = JSON.parse(readFileSync(fixturePath!, 'utf8'));
    const events: FinanceEvent[] = fixture.events.map(event => ({ ...event, end: event.end || null }));
    const rows = new Map([
        ...fixture.measurements.map(row => [row.month, { ...row, total: totalOf(row.cash, row.nisa) }] as const),
        ...project(fixture.measurements, events).map(row => [row.month, row] as const),
    ]);
    expect(fixture.expected.length).toBeGreaterThan(0);
    for (const expected of fixture.expected) {
        expect(rows.get(expected.month), expected.month).toEqual({ ...expected, total: totalOf(expected.cash, expected.nisa) });
    }
});
