import { describe, expect, it } from 'vitest';
import { combineStamps } from './stamp';

const T1 = '2026-11-01T01:00:00.123456+00:00';
const T2 = '2026-11-05T09:30:00+00:00';

describe('combineStamps', () => {
    it('行数は足し、updated_at は新しい方、版は日の順につなぐ', () => {
        const earlier = `2|${T1}#2026-11-01:3,2026-11-02:1#1|${T1}`;
        const later = `1|${T2}#2026-11-03:2#4|${T2}`;
        expect(combineStamps(earlier, later)).toBe(`3|${T2}#2026-11-01:3,2026-11-02:1,2026-11-03:2#5|${T2}`);
    });

    it('どちらかが空の範囲でも、空の区切りを残さない', () => {
        const empty = '0|##0|';
        const filled = `1|${T1}#2026-11-03:2#1|${T1}`;
        expect(combineStamps(empty, filled)).toBe(filled);
        expect(combineStamps(filled, empty)).toBe(filled);
        expect(combineStamps(empty, empty)).toBe(empty);
    });

    it('同じミリ秒で桁数が違うときは、マイクロ秒の大きい方を選ぶ', () => {
        const a = `1|2026-11-01T01:00:00.12345+00:00#d:1#0|`;
        const b = `1|2026-11-01T01:00:00.123456+00:00#e:1#0|`;
        expect(combineStamps(a, b)).toBe('2|2026-11-01T01:00:00.123456+00:00#d:1,e:1#0|');
        expect(combineStamps(b, a)).toBe('2|2026-11-01T01:00:00.123456+00:00#e:1,d:1#0|');
    });

    it('目印の形が違うときは null', () => {
        expect(combineStamps('x', '0|##0|')).toBeNull();
        expect(combineStamps('0|##0|', '0|#1#0|#')).toBeNull();
        expect(combineStamps('a|b#r#0|', '0|##0|')).toBeNull();
        expect(combineStamps('0|bad-date#r#0|', '0|2026-11-01T00:00:00+00:00#r#0|')).toBeNull();
    });
});

// サーバ側の目印(getSchedulesStamp / getScheduleDayRevisionsStamp / getScheduleDayNotesStamp)と同じ作り方を
// 手元の行から再現し、「範囲全体の目印 = 隣り合う2つの範囲の目印の合成」を固定する。
describe('combineStamps と範囲全体の目印の一致', () => {
    type Row = { day: string; updatedAt: string; revision: number };
    const countAndLatest = (rows: Row[]) => {
        const latest = rows.map((r) => r.updatedAt).sort().at(-1) ?? '';
        return `${rows.length}|${latest}`;
    };
    const stampOf = (rows: Row[], notes: Row[]) =>
        `${countAndLatest(rows)}#${[...rows].sort((a, b) => a.day.localeCompare(b.day)).map((r) => `${r.day}:${r.revision}`).join(',')}#${countAndLatest(notes)}`;

    const rows: Row[] = [
        { day: '2026-11-01', updatedAt: '2026-11-01T01:00:00.5+00:00', revision: 2 },
        { day: '2026-11-02', updatedAt: '2026-11-09T01:00:00+00:00', revision: 7 },
        { day: '2026-11-04', updatedAt: '2026-11-03T01:00:00.123456+00:00', revision: 1 },
        { day: '2026-11-05', updatedAt: '2026-11-03T01:00:00.12345+00:00', revision: 4 },
    ];
    const notes: Row[] = [
        { day: '2026-11-02', updatedAt: '2026-11-02T00:00:00+00:00', revision: 0 },
        { day: '2026-11-05', updatedAt: '2026-11-08T00:00:00.9+00:00', revision: 0 },
    ];

    it('どこで区切っても、合成した目印は範囲全体の目印と同じ', () => {
        const days = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'];
        const whole = stampOf(rows, notes);
        for (const cut of days) {
            const before = (r: Row) => r.day < cut;
            const earlier = stampOf(rows.filter(before), notes.filter(before));
            const later = stampOf(rows.filter((r) => !before(r)), notes.filter((r) => !before(r)));
            expect(combineStamps(earlier, later), `cut=${cut}`).toBe(whole);
        }
    });
});
