import { describe, expect, it } from 'vitest';
import type { GoalStatus } from '@/src/lib/schedules/free-time';
import { formatDue, goalVerdict } from './goal-format';

function status(partial: Partial<GoalStatus> & { needMinutes?: number }): GoalStatus {
    const { needMinutes = 0, ...rest } = partial;
    return {
        goal: { id: 'g', name: 'A', dueOn: '2026-10-16', dueMinutes: null, needMinutes, countFrom: '2026-10-01' },
        past: false,
        placedMinutes: 0,
        remainingMinutes: needMinutes,
        cumulativeMinutes: 0,
        supplyMinutes: 0,
        ok: true,
        ...rest,
    };
}

describe('formatDue', () => {
    it('shows month/day without zero padding, the weekday, and a zero-padded time', () => {
        // 2026-10-16 is a Friday.
        expect(formatDue('2026-10-16', 10 * 60 + 50)).toBe('10/16 金 10:50');
        expect(formatDue('2026-01-05', 9 * 60 + 5)).toBe('1/5 月 09:05');
    });

    it('omits the time when the due has none', () => {
        expect(formatDue('2026-10-16', null)).toBe('10/16 金');
    });

    it('handles midnight and the last minute of the day', () => {
        expect(formatDue('2026-10-18', 0)).toBe('10/18 日 00:00');
        expect(formatDue('2026-10-18', 23 * 60 + 59)).toBe('10/18 日 23:59');
    });

    it('does not depend on the local timezone for the weekday', () => {
        // Computed through Date.UTC: 2026-02-28 is a Saturday, 2026-03-01 a Sunday.
        expect(formatDue('2026-02-28', null)).toBe('2/28 土');
        expect(formatDue('2026-03-01', null)).toBe('3/1 日');
    });
});

describe('goalVerdict', () => {
    it('reports past goals before anything else', () => {
        expect(goalVerdict(status({ past: true, ok: true, cumulativeMinutes: 600, supplyMinutes: 0 }))).toEqual({
            kind: 'past',
        });
    });

    it('reports the margin as supply minus cumulative demand', () => {
        expect(goalVerdict(status({ ok: true, cumulativeMinutes: 90, supplyMinutes: 150 }))).toEqual({
            kind: 'ok',
            marginMinutes: 60,
        });
    });

    it('treats an exact fit as ok with zero margin', () => {
        expect(goalVerdict(status({ ok: true, cumulativeMinutes: 120, supplyMinutes: 120 }))).toEqual({
            kind: 'ok',
            marginMinutes: 0,
        });
    });

    it('reports the deficit as cumulative demand minus supply', () => {
        expect(goalVerdict(status({ ok: false, cumulativeMinutes: 200, supplyMinutes: 150 }))).toEqual({
            kind: 'short',
            deficitMinutes: 50,
        });
    });
});
