import { describe, expect, it } from 'vitest';
import { addDays, analyzeDayContent, evaluateGoals, freeMinutesBetween, type GoalInput } from './free-time';

const h = (hours: number) => hours * 60;

describe('analyzeDayContent', () => {
    it('treats a day with no lines as 0700 wake and 2200-2300 lights-out', () => {
        const a = analyzeDayContent('');
        expect(a.wake).toBe(h(7));
        expect(a.sleep).toBe(h(23));
        // 07:00-09:00 は身支度、22:00-23:00 は消灯の予定、23:00 以降は睡眠
        expect(a.runs.map((r) => [r.kind, r.start, r.end])).toEqual([
            ['sleep', 0, h(7)],
            ['busy', h(7), h(9)],
            ['free', h(9), h(22)],
            ['busy', h(22), h(23)],
            ['sleep', h(23), h(24)],
        ]);
        expect(a.freeMinutes).toBe(h(13));
    });

    it('counts events and the morning routine as busy', () => {
        const a = analyzeDayContent(
            ['0700 起床', '1000-1100 窓ガラス業者が来る', '1300-1600 論文の図', '2200-2300 消灯'].join('\n')
        );
        // 自由: 09:00-10:00, 11:00-13:00, 16:00-22:00
        expect(a.freeMinutes).toBe(h(1) + h(2) + h(6));
    });

    it('limits the morning routine to the first event when it comes within two hours', () => {
        const a = analyzeDayContent(['0700 起床', '0830-1300 BCL', '2200-2300 消灯'].join('\n'));
        expect(a.runs[1]).toEqual({ kind: 'busy', start: h(7), end: h(13) });
        expect(a.freeMinutes).toBe(h(9));
    });

    it('starts sleep at the end of the lights-out event and uses the wake line', () => {
        const a = analyzeDayContent(['1000 起床', '2300-2330 BM 読書 消灯'].join('\n'));
        expect(a.wake).toBe(h(10));
        expect(a.sleep).toBe(h(23.5));
        // 10:00-12:00 身支度、12:00-23:00 自由
        expect(a.freeMinutes).toBe(h(11));
    });

    it('ignores lines without an end time and reversed ranges (saved before the rule)', () => {
        const a = analyzeDayContent(['0700 起床', '1050 院生ゼミ', '1500-1300 逆', '2200-2300 消灯'].join('\n'));
        expect(a.events.map((e) => e.activity)).toEqual(['消灯']);
        expect(a.freeMinutes).toBe(h(13));
    });
});

describe('freeMinutesBetween', () => {
    it('counts only the free minutes inside the range', () => {
        expect(freeMinutesBetween(analyzeDayContent(''), h(8), h(12))).toBe(h(3));
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
        '2026-10-06': '0700 起床\n1300-1500 論文の図\n2200-2300 消灯',
        '2026-10-07': '0700 起床\n0900-1700 BCL\n2200-2300 消灯',
        '2026-10-08': '0700 起床\n1300-1600 論文の図\n2200-2300 消灯',
        '2026-10-09': '0700 起床\n2200-2300 消灯',
    };
    const days = new Map(Object.entries(contents).map(([d, c]) => [d, analyzeDayContent(c)]));
    const base = { days, today: '2026-10-07', nowMinutes: h(8) };
    const goal = (g: Partial<GoalInput> & Pick<GoalInput, 'id' | 'dueOn'>): GoalInput => ({
        name: '',
        dueMinutes: null,
        needMinutes: 0,
        countFrom: '2026-10-07',
        ...g,
    });

    it('counts events that contain the goal name as placed time, from countFrom', () => {
        const goals = [goal({ id: 'a', name: '論文の図', dueOn: '2026-10-09', dueMinutes: h(12), needMinutes: h(10) })];
        const [s] = evaluateGoals({ ...base, goals });
        // 10/6 の2時間は countFrom(10/7) より前なので数えない
        expect(s.placedMinutes).toBe(h(3));
        expect(s.remainingMinutes).toBe(h(7));
        // 10/7: 17:00-22:00 = 5h, 10/8: 09:00-13:00 + 16:00-22:00 = 10h, 10/9: 09:00-12:00 = 3h
        expect(s.supplyMinutes).toBe(h(5) + h(10) + h(3));
        expect(s.ok).toBe(true);

        const [fromEarlier] = evaluateGoals({ ...base, goals: [{ ...goals[0], countFrom: '2026-10-01' }] });
        expect(fromEarlier.placedMinutes).toBe(h(5));

        // 90日より前は、作った日が古くても数えない（/plan はそこまで読まないので両画面で揃える）
        const withOld = new Map(days).set('2026-06-01', analyzeDayContent('1300-1900 論文の図'));
        const [old] = evaluateGoals({ ...base, days: withOld, goals: [{ ...goals[0], countFrom: '2026-01-01' }] });
        expect(old.placedMinutes).toBe(h(5));
    });

    it('compares cumulative remaining time by earliest deadline', () => {
        const goals = [
            goal({ id: 'late', name: '課題B', dueOn: '2026-10-09', needMinutes: h(30) }),
            goal({ id: 'early', name: '課題A', dueOn: '2026-10-07', needMinutes: h(3) }),
        ];
        const [early, late] = evaluateGoals({ ...base, goals });
        expect(early.goal.id).toBe('early');
        expect(early.cumulativeMinutes).toBe(h(3));
        expect(early.ok).toBe(true);
        expect(late.cumulativeMinutes).toBe(h(33));
        // 10/7: 5h, 10/8: 10h, 10/9: 13h
        expect(late.supplyMinutes).toBe(h(28));
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
        // 10/7: 5h, 10/8: 10h, 10/9: 13h, 読み込んでいない 10/10: 13h と 10/11 の 12:00 まで: 3h
        expect(s.supplyMinutes).toBe(h(5) + h(10) + h(13) + h(13) + h(3));

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
        expect(s.supplyMinutes).toBe(h(3));
    });
});
