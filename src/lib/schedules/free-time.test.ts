import { describe, expect, it } from 'vitest';
import { addDays, analyzeDayContent, analyzeDays, evaluateGoals, freeMinutesBetween, type GoalInput } from './free-time';

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

    it('uses the wake line range as the morning routine instead of two hours', () => {
        const a = analyzeDayContent(['0700-1200 起床 発送 モーニングページ', '2200-2300 消灯'].join('\n'));
        expect(a.wake).toBe(h(7));
        expect(a.runs[1]).toEqual({ kind: 'busy', start: h(7), end: h(12) });
        expect(a.freeMinutes).toBe(h(10));
        // 起床の行は予定（置いた時間の集計）に入れない
        expect(a.events.map((e) => e.activity)).toEqual(['消灯']);
    });

    it('treats a zero-length wake range as no morning routine', () => {
        const a = analyzeDayContent(['0700-0700 起床', '2200-2300 消灯'].join('\n'));
        expect(a.runs[1]).toEqual({ kind: 'free', start: h(7), end: h(22) });
        expect(a.freeMinutes).toBe(h(15));
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

describe('analyzeDays', () => {
    const kinds = (a: { runs: { kind: string; start: number; end: number }[] }) =>
        a.runs.map((r) => [r.kind, r.start, r.end]);

    it('sleeps from the end of lights-out to the next wake across the day boundary', () => {
        const days = analyzeDays([
            { date: '2026-10-17', content: '0730 起床\n1400-1600 作業\n2200-2359 休憩', loaded: true },
            { date: '2026-10-18', content: '0000-0300 消灯\n0900-1200 起床 発送\n2200-2300 消灯', loaded: true },
        ]);
        // 10/17 は消灯の行が無いので24時まで起きている（2359 の終わりは24時）
        expect(kinds(days.get('2026-10-17')!)).toEqual([
            ['sleep', 0, h(7.5)],
            ['busy', h(7.5), h(9.5)],
            ['free', h(9.5), h(14)],
            ['busy', h(14), h(16)],
            ['free', h(16), h(22)],
            ['busy', h(22), h(24)],
        ]);
        // 10/18 は 0000-0300 の消灯が起きている時間で、03:00 から起床までが睡眠
        expect(kinds(days.get('2026-10-18')!)).toEqual([
            ['busy', 0, h(3)],
            ['sleep', h(3), h(9)],
            ['busy', h(9), h(12)],
            ['free', h(12), h(22)],
            ['busy', h(22), h(23)],
            ['sleep', h(23), h(24)],
        ]);
        expect(days.get('2026-10-18')!.freeMinutes).toBe(h(10));
    });

    it('ignores a second lights-out before the next wake', () => {
        const days = analyzeDays([
            { date: '2026-10-17', content: '0700 起床\n2200-2300 消灯', loaded: true },
            { date: '2026-10-18', content: '0000-0300 消灯\n0900 起床', loaded: true },
        ]);
        expect(kinds(days.get('2026-10-17')!).at(-1)).toEqual(['sleep', h(23), h(24)]);
        expect(kinds(days.get('2026-10-18')!)[0]).toEqual(['sleep', 0, h(9)]);
    });

    it('ignores a second wake while awake', () => {
        const days = analyzeDays([
            { date: '2026-10-17', content: '0700 起床', loaded: true },
            { date: '2026-10-18', content: '0900 起床\n2200-2300 消灯', loaded: true },
        ]);
        // 10/17 は消灯が無いので、10/18 の 0900 起床までずっと起きている
        expect(kinds(days.get('2026-10-18')!).slice(0, 2)).toEqual([
            ['free', 0, h(9)],
            ['busy', h(9), h(11)],
        ]);
    });

    it('uses every wake line of a day, so a nap ended by lights-out and a second wake is counted', () => {
        const a = analyzeDayContent('0700 起床\n1200-1300 消灯\n1800 起床\n2200-2300 消灯', true);
        expect(kinds(a)).toEqual([
            ['sleep', 0, h(7)],
            ['busy', h(7), h(9)],
            ['free', h(9), h(12)],
            ['busy', h(12), h(13)],
            ['sleep', h(13), h(18)],
            ['busy', h(18), h(20)],
            ['free', h(20), h(22)],
            ['busy', h(22), h(23)],
            ['sleep', h(23), h(24)],
        ]);
    });

    it('ignores a wake inside a lights-out event, since sleep starts only at its end', () => {
        const days = analyzeDays([
            { date: '2026-10-18', content: '0000-0300 消灯\n0100 起床', loaded: true },
            { date: '2026-10-19', content: '0700 起床\n2200-2300 消灯', loaded: true },
        ]);
        expect(kinds(days.get('2026-10-18')!).at(-1)).toEqual(['sleep', h(3), h(24)]);
        expect(kinds(days.get('2026-10-19')!)[0]).toEqual(['sleep', 0, h(7)]);
    });

    it('does not add the default lights-out to an unloaded day that already has a lights-out line', () => {
        const a = analyzeDayContent('0000-0300 消灯\n0900 起床');
        // 03:00-09:00 睡眠、09:00-11:00 身支度、その後は24時まで起きている
        expect(a.freeMinutes).toBe(h(13));
    });

    it('fills the default wake and lights-out only on days the schedule page has not loaded', () => {
        const days = analyzeDays([
            { date: '2026-10-20', content: '0700 起床\n1300-1500 作業', loaded: true },
            { date: '2026-10-21', content: '1300-1500 作業', loaded: false },
        ]);
        // 読み込んだ日は行のとおり（消灯が無いので24時まで起きている）
        expect(kinds(days.get('2026-10-20')!).at(-1)).toEqual(['free', h(15), h(24)]);
        // 読み込んでいない日は 0700 起床・2200-2300 消灯で補う（前日から起きているので 0700 は境目にならず、
        // 身支度だけ置く）
        expect(kinds(days.get('2026-10-21')!)).toEqual([
            ['free', 0, h(7)],
            ['busy', h(7), h(9)],
            ['free', h(9), h(13)],
            ['busy', h(13), h(15)],
            ['free', h(15), h(22)],
            ['busy', h(22), h(23)],
            ['sleep', h(23), h(24)],
        ]);
    });

    it('paints events named 睡眠 as sleep without moving the wake/lights-out boundaries', () => {
        const a = analyzeDayContent('0730 起床\n0800-1330 睡眠\n1330-1400 睡眠薬を買う\n2200-2300 消灯', true);
        expect(kinds(a).slice(0, 5)).toEqual([
            ['sleep', 0, h(7.5)],
            ['busy', h(7.5), h(8)],
            ['sleep', h(8), h(13.5)],
            ['busy', h(13.5), h(14)],
            ['free', h(14), h(22)],
        ]);
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
        ...g,
    });

    it('counts only the part of matching events after now', () => {
        const goals = [goal({ id: 'a', name: '論文の図', dueOn: '2026-10-09', dueMinutes: h(12), needMinutes: h(10) })];
        const [s] = evaluateGoals({ ...base, goals });
        // 10/6 の2時間は過去なので数えない。10/8 の3時間だけ
        expect(s.placedMinutes).toBe(h(3));
        expect(s.remainingMinutes).toBe(h(7));
        // 10/7: 17:00-22:00 = 5h, 10/8: 09:00-13:00 + 16:00-22:00 = 10h, 10/9: 09:00-12:00 = 3h
        expect(s.supplyMinutes).toBe(h(5) + h(10) + h(3));
        expect(s.ok).toBe(true);

        // 今日の 13:00-15:00 は、14:00 の時点では残り 1h
        const today = new Map(days).set('2026-10-07', analyzeDayContent('1300-1500 論文の図'));
        const [midway] = evaluateGoals({ ...base, days: today, nowMinutes: h(14), goals });
        expect(midway.placedMinutes).toBe(h(1) + h(3));
        const [done] = evaluateGoals({ ...base, days: today, nowMinutes: h(15), goals });
        expect(done.placedMinutes).toBe(h(3));
    });

    it('counts only events where the goal name is delimited by whitespace or the line ends', () => {
        const withNames = new Map(days).set(
            '2026-10-09',
            analyzeDayContent(
                [
                    '0900-1000 xyz',
                    '1000-1100 xyz abc',
                    '1100-1200 abc xyz',
                    '1200-1300 xyzabc',
                    '1300-1400 abcxyz',
                    '1400-1500 abc xyzabc xyz',
                    '1500-1600 xyz-abc',
                ].join('\n')
            )
        );
        const [s] = evaluateGoals({
            ...base,
            days: withNames,
            goals: [goal({ id: 'x', name: 'xyz', dueOn: '2026-10-09', needMinutes: h(10) })],
        });
        // 09-10, 10-11, 11-12, 14-15（2つ目の xyz が語として当たる）
        expect(s.placedMinutes).toBe(h(4));
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

    it('does not blame a goal whose remaining time is zero for an earlier deadline running short', () => {
        const goals = [
            // 10/7 の締切までは空きが 5h しか無いのに 20h 必要 → 不足
            goal({ id: 'early', name: '課題A', dueOn: '2026-10-07', needMinutes: h(20) }),
            // 10/8 の 論文の図 は 3h 置いてあり、必要 3h を満たしている → 先の不足を引き継がない
            goal({ id: 'done', name: '論文の図', dueOn: '2026-10-08', needMinutes: h(3) }),
        ];
        const [early, done] = evaluateGoals({ ...base, goals });
        expect(early.ok).toBe(false);
        expect(done.remainingMinutes).toBe(0);
        expect(done.cumulativeMinutes).toBe(h(20));
        expect(done.ok).toBe(true);
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

    it('uses the days before today to know whether today starts awake', () => {
        // 前日に消灯が無く起きたまま。今日の 0900 起床は境目にならず、0〜9時は自由
        const awake = analyzeDays([
            { date: '2026-10-06', content: '0700 起床', loaded: true },
            { date: '2026-10-07', content: '0900 起床\n2200-2300 消灯', loaded: true },
        ]);
        const [s] = evaluateGoals({
            days: awake,
            today: '2026-10-07',
            nowMinutes: 0,
            goals: [goal({ id: 'a', dueOn: '2026-10-07', dueMinutes: h(8), needMinutes: h(1) })],
        });
        expect(s.supplyMinutes).toBe(h(8));
        expect(s.ok).toBe(true);
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
