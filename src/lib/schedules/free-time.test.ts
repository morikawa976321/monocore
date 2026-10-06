import { describe, expect, it } from 'vitest';
import {
    addDays,
    analyzeDayContent,
    evaluateGoals,
    usableFreeMinutes,
    type GoalInput,
} from './free-time';

const h = (hours: number) => hours * 60;

describe('analyzeDayContent', () => {
    it('uses 0700-2330 as the waking window when the day has no wake/sleep lines', () => {
        const a = analyzeDayContent('');
        expect(a.wake).toBe(h(7));
        expect(a.sleep).toBe(h(23.5));
        expect(a.freeMinutes).toBe(h(16.5));
        expect(a.gaps).toHaveLength(1);
        expect(a.gaps[0].deep).toBe(true);
    });

    it('takes wake from the 起床 line and ignores a 消灯 before it (the previous night)', () => {
        const a = analyzeDayContent(['0200 消灯', '0700 起床 靴のテストプリント', '2330 BM 読書 消灯'].join('\n'));
        expect(a.wake).toBe(h(7));
        expect(a.sleep).toBe(h(23.5));
        expect(a.segments).toHaveLength(0);
    });

    it('estimates lengths of start-only events: class period, departure, and 60 minutes', () => {
        const content = [
            '0700 起床',
            '1000 出発',
            '1050 院生ゼミ',
            '1500 図書館',
            '2330 BM 読書 消灯',
        ].join('\n');
        const a = analyzeDayContent(content);
        const byName = Object.fromEntries(a.segments.map((s) => [s.activity, s]));
        expect(byName['出発']).toMatchObject({ start: h(10), end: 650, kind: 'estimated' });
        expect(byName['院生ゼミ']).toMatchObject({ start: 650, end: 750, kind: 'estimated' });
        expect(byName['図書館']).toMatchObject({ start: h(15), end: h(16), kind: 'estimated' });
        // 07:00-10:00, 12:30-15:00, 16:00-23:30
        expect(a.freeMinutes).toBe(h(3) + h(2.5) + h(7.5));
        expect(a.maxGapMinutes).toBe(h(7.5));
    });

    it('stops a start-only event at the next event', () => {
        const a = analyzeDayContent(['1330 マウスをプリント', '1400-1600 作業'].join('\n'));
        expect(a.segments[0]).toMatchObject({ start: 810, end: 840 });
    });

    it('treats delivery windows as home-bound, not free', () => {
        const a = analyzeDayContent('1400-1600 マットレス受け取り\n旧マットレスの解体');
        expect(a.segments[0].kind).toBe('home');
        expect(a.freeMinutes).toBe(h(16.5) - h(2));
    });

    it('cuts a range that crosses midnight at the end of the day', () => {
        const a = analyzeDayContent('2300-0100 作業');
        expect(a.segments[0]).toMatchObject({ start: h(23), end: h(24) });
    });

    it('does not turn a reversed or zero-length daytime range into a block until midnight', () => {
        expect(analyzeDayContent('1500-1300 作業').segments[0]).toMatchObject({ start: h(15), end: h(15) + 5 });
        expect(analyzeDayContent('1000-1000 作業').segments[0]).toMatchObject({ start: h(10), end: h(10) + 5 });
    });
});

describe('usableFreeMinutes', () => {
    it('subtracts daily living time in proportion to the clipped window', () => {
        const a = analyzeDayContent('');
        expect(usableFreeMinutes(a, 0, h(24), 0)).toBe(h(16.5));
        expect(usableFreeMinutes(a, 0, h(24), h(3))).toBe(h(13.5));
        // 後半だけ（持ち時間の半分）なら生活時間も半分だけ引く
        const half = h(7) + h(16.5) / 2;
        expect(usableFreeMinutes(a, half, h(24), h(3))).toBeCloseTo(h(16.5) / 2 - h(1.5));
    });
});

describe('addDays', () => {
    it('crosses month boundaries', () => {
        expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
        expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
    });
});

describe('evaluateGoals', () => {
    const contents: Record<string, string> = {
        '2026-10-06': '0700 起床\n1300-1500 論文の図\n2330 BM 読書 消灯',
        '2026-10-07': '0700 起床\n0900-1700 BCL\n2330 BM 読書 消灯',
        '2026-10-08': '0700 起床\n1300-1600 論文の図\n2330 BM 読書 消灯',
        '2026-10-09': '0700 起床\n2330 BM 読書 消灯',
    };
    const days = new Map(Object.entries(contents).map(([d, c]) => [d, analyzeDayContent(c)]));
    const base = { days, today: '2026-10-07', nowMinutes: h(8), lifeMinutesPerDay: 0 };
    const goal = (g: Partial<GoalInput> & Pick<GoalInput, 'id' | 'dueOn'>): GoalInput => ({
        name: '',
        dueMinutes: null,
        needMinutes: 0,
        countFrom: '2026-10-07',
        ...g,
    });

    it('counts ranged lines that contain the goal name as placed time, from countFrom', () => {
        const goals = [goal({ id: 'a', name: '論文の図', dueOn: '2026-10-09', dueMinutes: h(12), needMinutes: h(10) })];
        const [s] = evaluateGoals({ ...base, goals });
        // 10/6 の2時間は countFrom(10/7) より前なので数えない
        expect(s.placedMinutes).toBe(h(3));
        expect(s.remainingMinutes).toBe(h(7));
        // 10/7: 8:00-9:00 + 17:00-23:30 = 7.5h, 10/8: 16.5-3 = 13.5h, 10/9: 7:00-12:00 = 5h
        expect(s.supplyMinutes).toBe(h(7.5) + h(13.5) + h(5));
        expect(s.ok).toBe(true);

        const [fromEarlier] = evaluateGoals({ ...base, goals: [{ ...goals[0], countFrom: '2026-10-01' }] });
        expect(fromEarlier.placedMinutes).toBe(h(5));
    });

    it('compares cumulative remaining time by earliest deadline', () => {
        const goals = [
            goal({ id: 'late', name: '課題B', dueOn: '2026-10-09', needMinutes: h(30) }),
            goal({ id: 'early', name: '課題A', dueOn: '2026-10-07', needMinutes: h(3) }),
        ];
        const [early, late] = evaluateGoals({ ...base, goals, lifeMinutesPerDay: h(4) });
        expect(early.goal.id).toBe('early');
        expect(early.cumulativeMinutes).toBe(h(3));
        expect(late.cumulativeMinutes).toBe(h(33));
        expect(early.ok).toBe(true);
        expect(late.supplyMinutes).toBeLessThan(h(33));
        expect(late.ok).toBe(false);
    });

    it('marks goals whose deadline has passed and leaves them out of the cumulative check', () => {
        const goals = [
            goal({ id: 'old', name: 'X', dueOn: '2026-10-06', needMinutes: h(100) }),
            goal({ id: 'next', name: 'Y', dueOn: '2026-10-09', needMinutes: h(1) }),
        ];
        const [old, next] = evaluateGoals({ ...base, goals });
        expect(old.past).toBe(true);
        expect(next.cumulativeMinutes).toBe(h(1));
        expect(next.ok).toBe(true);
    });

    it('counts days beyond the loaded range as empty days without walking them one by one', () => {
        const [s] = evaluateGoals({ ...base, goals: [goal({ id: 'x', dueOn: '2026-10-11', dueMinutes: h(12) })] });
        // 10/7: 7.5h, 10/8: 13.5h, 10/9: 16.5h, 読み込んでいない 10/10: 16.5h と 10/11 の 12:00 まで: 5h
        expect(s.supplyMinutes).toBe(h(7.5) + h(13.5) + h(16.5) + h(16.5) + h(5));

        const started = performance.now();
        const [far] = evaluateGoals({ ...base, goals: [goal({ id: 'far', dueOn: '9999-12-31' })] });
        expect(performance.now() - started).toBeLessThan(50);
        expect(far.supplyMinutes).toBeGreaterThan(0);
    });

    it('handles a goal due today on a day that was not loaded', () => {
        const [s] = evaluateGoals({
            ...base,
            days: new Map(),
            goals: [goal({ id: 't', dueOn: '2026-10-07', dueMinutes: h(12) })],
        });
        expect(s.supplyMinutes).toBe(h(4));
    });
});
