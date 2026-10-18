import { describe, expect, it } from 'vitest';
import type { GoalStatus } from '@/src/lib/schedules/free-time';
import {
    type CapacityDay,
    cumulativeColumns,
    isMonday,
    layoutCapacityChart,
    niceStep,
    placeLabels,
    positionWithinDay,
    shortDate,
} from './capacity-chart';

function day(date: string, usableMinutes: number): CapacityDay {
    return { date, usableMinutes };
}

function status(
    id: string,
    dueOn: string,
    dueMinutes: number | null,
    cumulativeMinutes: number,
    extra: Partial<GoalStatus> = {}
): GoalStatus {
    return {
        goal: { id, name: id, dueOn, dueMinutes, needMinutes: cumulativeMinutes },
        past: false,
        placedMinutes: 0,
        remainingMinutes: cumulativeMinutes,
        cumulativeMinutes,
        supplyMinutes: 0,
        ok: true,
        ...extra,
    };
}

describe('niceStep', () => {
    it('switches at 60h, 150h and 300h (inclusive on the lower side)', () => {
        expect(niceStep(0)).toBe(10);
        expect(niceStep(60)).toBe(10);
        expect(niceStep(60.01)).toBe(25);
        expect(niceStep(150)).toBe(25);
        expect(niceStep(150.01)).toBe(50);
        expect(niceStep(300)).toBe(50);
        expect(niceStep(300.01)).toBe(100);
    });
});

describe('shortDate / isMonday', () => {
    it('drops the year and zero padding', () => {
        expect(shortDate('2026-10-05')).toBe('10/5');
        expect(shortDate('2026-12-31')).toBe('12/31');
    });

    it('finds Mondays by the calendar date, not local time', () => {
        expect(isMonday('2026-10-12')).toBe(true);
        expect(isMonday('2026-10-11')).toBe(false);
        expect(isMonday('2026-10-13')).toBe(false);
    });
});

describe('cumulativeColumns', () => {
    it('is empty for no days', () => {
        expect(cumulativeColumns([])).toEqual([]);
    });

    it('stacks each day on the previous total, keeping zero-width days in place', () => {
        const cols = cumulativeColumns([day('2026-10-10', 120), day('2026-10-11', 0), day('2026-10-12', 60)]);
        expect(cols.map((c) => [c.c0, c.c1])).toEqual([
            [0, 120],
            [120, 120],
            [120, 180],
        ]);
        expect(cols[2].date).toBe('2026-10-12');
    });
});

describe('positionWithinDay', () => {
    it('puts a due without a time at the end of the day', () => {
        expect(positionWithinDay(null)).toBe(1);
    });

    it('places a time by the clock, from midnight (0) to the end of the day (1)', () => {
        expect(positionWithinDay(0)).toBe(0);
        expect(positionWithinDay(6 * 60)).toBe(0.25);
        expect(positionWithinDay(12 * 60)).toBe(0.5);
        expect(positionWithinDay(24 * 60)).toBe(1);
    });
});

describe('layoutCapacityChart', () => {
    it('returns null when there are no days', () => {
        expect(layoutCapacityChart([], [])).toBeNull();
    });

    it('keeps a minimum axis of one step when nothing is usable and nothing is due', () => {
        const layout = layoutCapacityChart([day('2026-10-10', 0), day('2026-10-11', 0)], [])!;
        expect(layout.step).toBe(10);
        expect(layout.yMax).toBe(10);
        expect(layout.ticks).toEqual([10]);
        expect(layout.y(10 * 60)).toBe(100);
        expect(layout.y(0)).toBe(0);
        expect(layout.marks).toEqual([]);
        expect(layout.upcoming).toEqual([]);
    });

    it('rounds the axis top up to the next step above the total free time', () => {
        // 25h total → step 10 → yMax 30.
        const layout = layoutCapacityChart([day('2026-10-10', 10 * 60), day('2026-10-11', 15 * 60)], [])!;
        expect(layout.yMax).toBe(30);
        expect(layout.ticks).toEqual([10, 20, 30]);
        expect(layout.cols.map((c) => c.c1)).toEqual([600, 1500]);
        expect(layout.y(1500)).toBeCloseTo((25 / 30) * 100);
    });

    it('does not add a step when the total already sits on a step boundary', () => {
        const layout = layoutCapacityChart([day('2026-10-10', 20 * 60)], [])!;
        expect(layout.yMax).toBe(20);
        expect(layout.ticks).toEqual([10, 20]);
    });

    it('picks the step from the larger of free time and demand, then rounds', () => {
        // Demand 61h exceeds 60h → step 25 → yMax 75.
        const layout = layoutCapacityChart([day('2026-10-10', 60)], [status('a', '2026-10-10', null, 61 * 60)])!;
        expect(layout.step).toBe(25);
        expect(layout.yMax).toBe(75);
        expect(layout.ticks).toEqual([25, 50, 75]);
    });

    it('lets demand above the free total raise the axis so the line stays inside', () => {
        const layout = layoutCapacityChart([day('2026-10-10', 60)], [status('a', '2026-10-10', null, 35 * 60)])!;
        expect(layout.yMax).toBe(40);
        expect(layout.marks[0].my).toBeCloseTo((35 / 40) * 100);
    });

    it('splits the width evenly by day', () => {
        const days = ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13'].map((d) => day(d, 60));
        const layout = layoutCapacityChart(days, [])!;
        expect(layout.columnWidthPercent).toBe(25);
        expect(layout.x(0)).toBe(0);
        expect(layout.x(1)).toBe(25);
        expect(layout.x(4)).toBe(100);
    });

    it('leaves out past goals and goals due outside the drawn days', () => {
        const days = [day('2026-10-10', 60), day('2026-10-11', 60)];
        const inRange = status('in', '2026-10-11', null, 60);
        const past = status('past', '2026-10-10', 600, 0, { past: true });
        const later = status('later', '2026-10-12', null, 120);
        const layout = layoutCapacityChart(days, [past, inRange, later])!;
        expect(layout.upcoming).toEqual([inRange]);
        expect(layout.marks.map((m) => m.status.goal.id)).toEqual(['in']);
    });

    it('draws the demand line as a staircase from the origin through each deadline', () => {
        const days = [day('2026-10-10', 120), day('2026-10-11', 120), day('2026-10-12', 120)];
        const first = status('a', '2026-10-10', 15 * 60, 60);
        const second = status('b', '2026-10-12', null, 180);
        const layout = layoutCapacityChart(days, [first, second])!;
        // 6h total → yMax 10h.
        expect(layout.yMax).toBe(10);
        const [m1, m2] = layout.marks;
        expect(m1.fromX).toBe(0);
        expect(m1.fromY).toBe(0);
        // 15:00 is 15/24 of the first column.
        expect(m1.mx).toBeCloseTo((15 / 24 / 3) * 100);
        expect(m1.my).toBeCloseTo(10);
        expect(m2.fromX).toBe(m1.mx);
        expect(m2.fromY).toBe(m1.my);
        // No time → end of the third column, which is the right edge.
        expect(m2.mx).toBeCloseTo(100);
        expect(m2.my).toBeCloseTo(30);
    });

    it('positions a deadline inside its own day by the clock', () => {
        const layout = layoutCapacityChart([day('2026-10-10', 60), day('2026-10-11', 60)], [status('a', '2026-10-11', 12 * 60, 30)])!;
        // 12:00 is the middle of the second day → 1.5 days of 2.
        expect(layout.marks[0].mx).toBeCloseTo((1.5 / 2) * 100);
    });
});

describe('placeLabels', () => {
    it('right-aligns each label to its line and keeps separated labels on the bottom row', () => {
        const p = placeLabels([{ anchor: 100, width: 50 }, { anchor: 300, width: 50 }], -48, 600, 8);
        expect(p.left).toEqual([50, 250]);
        expect(p.row).toEqual([0, 0]);
        expect(p.rows).toBe(1);
    });

    it('stacks as many rows as overlapping labels need, reusing a lower row once it is free', () => {
        // 3 labels on nearly the same day overlap each other; the 4th is far enough to go back to row 0.
        const p = placeLabels(
            [
                { anchor: 200, width: 120 },
                { anchor: 210, width: 120 },
                { anchor: 220, width: 120 },
                { anchor: 500, width: 100 },
            ],
            -48,
            600,
            8
        );
        expect(p.row).toEqual([0, 1, 2, 0]);
        expect(p.rows).toBe(3);
    });

    it('requires the gap between labels on the same row', () => {
        const p = placeLabels([{ anchor: 100, width: 100 }, { anchor: 205, width: 100 }], 0, 600, 8);
        // ends at 100, next starts at 105 → less than the 8px gap → next row.
        expect(p.row).toEqual([0, 1]);
    });

    it('pushes a label that would stick out back inside the bounds', () => {
        const p = placeLabels([{ anchor: 10, width: 120 }, { anchor: 700, width: 50 }], -48, 600, 8);
        expect(p.left).toEqual([-48, 550]);
    });
});
