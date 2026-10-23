import { describe, expect, it } from 'vitest';
import { addDays, analyzeDayContent, analyzeDays } from './free-time';

const h = (hours: number) => hours * 60;

describe('analyzeDayContent', () => {
    it('treats a day with no lines as 0700 wake and 2200-2300 lights-out', () => {
        const a = analyzeDayContent('');
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
        // 10:00-12:00 身支度、12:00-23:00 自由、23:00-23:30 消灯の予定、23:30 から睡眠
        expect(a.runs.map((r) => [r.kind, r.start, r.end])).toEqual([
            ['sleep', 0, h(10)],
            ['busy', h(10), h(12)],
            ['free', h(12), h(23)],
            ['busy', h(23), h(23.5)],
            ['sleep', h(23.5), h(24)],
        ]);
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

    it('treats a zero-length lights-out range as falling asleep at that time', () => {
        const a = analyzeDayContent('0700 起床\n2200-2200 消灯', true);
        expect(kinds(a).at(-1)).toEqual(['sleep', h(22), h(24)]);
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

// 予定テキストの解釈。性質テスト（free-time.property.test.ts）は行の構造から作るので、テキスト固有の解釈はここで確かめる。
describe('analyzeDays: interpretation of the text', () => {
    const kinds = (a: { runs: { kind: string; start: number; end: number }[] }) =>
        a.runs.map((r) => [r.kind, r.start, r.end]);
    const plainDay = [
        ['sleep', 0, h(7)],
        ['busy', h(7), h(9)],
        ['free', h(9), h(22)],
        ['busy', h(22), h(23)],
        ['sleep', h(23), h(24)],
    ];

    it('reads a description continued on the next lines as part of the time line', () => {
        expect(kinds(analyzeDayContent('0700\n起床\n2200-2300\n消灯', true))).toEqual(plainDay);
    });

    it('reads 起床 and 消灯 only as words, like 睡眠 and goal names', () => {
        // 「起床時刻の見直し」は起床ではないので、前夜からの睡眠は 07:00 の起床まで続く
        const days = analyzeDays([
            { date: '2026-10-17', content: '0700 起床\n2200-2300 消灯', loaded: true },
            { date: '2026-10-18', content: '0700 起床\n0300-0330 起床時刻の見直し\n2200-2300 消灯', loaded: true },
        ]);
        expect(kinds(days.get('2026-10-18')!)).toEqual(plainDay);
        // 「消灯前の片付け」は消灯ではないので、20:30 からは眠らない
        const a = analyzeDayContent('0700 起床\n2000-2030 消灯前の片付け\n2200-2300 消灯', true);
        expect(kinds(a).slice(2)).toEqual([
            ['free', h(9), h(20)],
            ['busy', h(20), h(20.5)],
            ['free', h(20.5), h(22)],
            ['busy', h(22), h(23)],
            ['sleep', h(23), h(24)],
        ]);
    });

    it('does not read 起床 followed by punctuation as a wake', () => {
        // 「起床。」は語として当たらない（保存前の検査でも終了の無い予定として弾かれる）。起床が無いので
        // 範囲の最初の印は 23:00 の入眠で、それより前は起きている
        expect(kinds(analyzeDayContent('0700 起床。\n2200-2300 消灯', true))).toEqual([
            ['free', 0, h(22)],
            ['busy', h(22), h(23)],
            ['sleep', h(23), h(24)],
        ]);
    });

    it('does not paint a wake line that also says 睡眠 as sleep', () => {
        // 起床の行は予定ではないので「睡眠」の塗りにならず、範囲が身支度になる
        const a = analyzeDayContent('0700 起床\n1300-1400 起床 睡眠\n2200-2300 消灯', true);
        expect(kinds(a).slice(2, 5)).toEqual([
            ['free', h(9), h(13)],
            ['busy', h(13), h(14)],
            ['free', h(14), h(22)],
        ]);
    });

    it('treats a reversed wake range as a wake time without a range', () => {
        expect(kinds(analyzeDayContent('0900-0700 起床\n2200-2300 消灯', true)).slice(0, 2)).toEqual([
            ['sleep', 0, h(9)],
            ['busy', h(9), h(11)],
        ]);
    });

    it('reads the end 2359 as 24:00 even for a zero-length range', () => {
        // 2359-2359 は 23:59〜24:00 の1分になる
        expect(kinds(analyzeDayContent('0700 起床\n2359-2359 消灯', true)).at(-1)).toEqual(['busy', h(24) - 1, h(24)]);
        expect(kinds(analyzeDayContent('2359-2359 起床', true))).toEqual([
            ['sleep', 0, h(24) - 1],
            ['busy', h(24) - 1, h(24)],
        ]);
    });
});

describe('analyzeDays: boundary cases', () => {
    const kinds = (a: { runs: { kind: string; start: number; end: number }[] }) =>
        a.runs.map((r) => [r.kind, r.start, r.end]);

    it('is awake when lights-out ends at the same time as a wake', () => {
        const days = analyzeDays([
            { date: '2026-10-17', content: '0700 起床', loaded: true },
            { date: '2026-10-18', content: '0000-0300 消灯\n0300 起床\n2200-2300 消灯', loaded: true },
        ]);
        // 03:00 に消灯が終わり 03:00 に起床するので眠らない。0〜3時は消灯の予定、3〜5時は身支度
        expect(kinds(days.get('2026-10-18')!)).toEqual([
            ['busy', 0, h(5)],
            ['free', h(5), h(22)],
            ['busy', h(22), h(23)],
            ['sleep', h(23), h(24)],
        ]);
    });

    it('gives no morning routine when an event is still going on at the wake time', () => {
        // 未読込の日の既定の 07:00 起床。03:31-07:01 の予定が続いているので身支度は0分で、07:01 から自由
        const a = analyzeDayContent('0331-0701 作業');
        expect(kinds(a).slice(0, 3)).toEqual([
            ['sleep', 0, h(7)],
            ['busy', h(7), h(7) + 1],
            ['free', h(7) + 1, h(22)],
        ]);
    });

    it('infers the state before the range from its first mark, even across days without marks', () => {
        // 範囲の最初の印が起床なので、それより前の印の無い8日間はすべて睡眠になる（前の日を読まない限り確定できない）
        const days = analyzeDays([
            ...Array.from({ length: 8 }, (_, i) => ({ date: addDays('2026-10-10', i), content: '1000-1200 作業', loaded: true })),
            { date: '2026-10-18', content: '0700 起床\n2200-2300 消灯', loaded: true },
        ]);
        expect(kinds(days.get('2026-10-10')!)).toEqual([['sleep', 0, h(24)]]);
        expect(days.get('2026-10-18')!.freeMinutes).toBe(h(13));
    });
});

describe('addDays', () => {
    it('crosses month boundaries', () => {
        expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
        expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
    });
});
