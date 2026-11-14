import { describe, expect, it } from 'vitest';
import { combineStamps, schedulesPartOf } from './stamp';

const T1 = '2026-11-01T01:00:00.123456+00:00';
const T2 = '2026-11-05T09:30:00+00:00';

describe('combineStamps', () => {
    it('行数は足し、updated_at は新しい方、版は日の順につなぐ', () => {
        const earlier = `2|${T1}#2026-11-01:3,2026-11-02:1#2026-11-01:${T1}`;
        const later = `1|${T2}#2026-11-03:2#2026-11-04:${T2},2026-11-05:${T2}`;
        expect(combineStamps(earlier, later)).toBe(
            `3|${T2}#2026-11-01:3,2026-11-02:1,2026-11-03:2#2026-11-01:${T1},2026-11-04:${T2},2026-11-05:${T2}`
        );
    });

    it('どちらかが空の範囲でも、空の区切りを残さない', () => {
        const empty = '0|##';
        const filled = `1|${T1}#2026-11-03:2#2026-11-03:${T1}`;
        expect(combineStamps(empty, filled)).toBe(filled);
        expect(combineStamps(filled, empty)).toBe(filled);
        expect(combineStamps(empty, empty)).toBe(empty);
    });

    it('同じミリ秒で桁数が違うときは、マイクロ秒の大きい方を選ぶ', () => {
        const a = `1|2026-11-01T01:00:00.12345+00:00#d:1#`;
        const b = `1|2026-11-01T01:00:00.123456+00:00#e:1#`;
        expect(combineStamps(a, b)).toBe('2|2026-11-01T01:00:00.123456+00:00#d:1,e:1#');
        expect(combineStamps(b, a)).toBe('2|2026-11-01T01:00:00.123456+00:00#e:1,d:1#');
    });

    it('目印の形が違うときは null', () => {
        expect(combineStamps('x', '0|##')).toBeNull();
        expect(combineStamps('0|##', '0|#1##')).toBeNull();
        expect(combineStamps('a|b##', '0|##')).toBeNull();
        expect(combineStamps('0|bad-date#r#', '0|2026-11-01T00:00:00+00:00#r#')).toBeNull();
    });
});

// サーバ側の目印(getSchedulesStamp / getScheduleDayRevisionsStamp / getScheduleDayNotesStamp)と同じ作り方を
// 手元の行から再現し、「範囲全体の目印 = 隣り合う2つの範囲の目印の合成」を固定する。
describe('schedulesPartOf', () => {
    it('予定の部分だけを返し、形が違えば null', () => {
        expect(schedulesPartOf(`2|${T1}#d:1#d:${T1}`)).toBe(`2|${T1}`);
        expect(schedulesPartOf('x')).toBeNull();
    });
});

describe('combineStamps と範囲全体の目印の一致', () => {
    type Row = { day: string; updatedAt: string; revision: number };
    const byDay = (rows: Row[]) => [...rows].sort((a, b) => a.day.localeCompare(b.day));
    const stampOf = (rows: Row[], notes: Row[]) => {
        const latest = rows.map((r) => r.updatedAt).sort().at(-1) ?? '';
        const revisions = byDay(rows).map((r) => `${r.day}:${r.revision}`).join(',');
        const noteList = byDay(notes).map((r) => `${r.day}:${r.updatedAt}`).join(',');
        return `${rows.length}|${latest}#${revisions}#${noteList}`;
    };

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
    const days = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'];

    function stampsSplitAt(cut: string, rowsNow: Row[], notesNow: Row[]) {
        const before = (r: Row) => r.day < cut;
        return {
            earlier: stampOf(rowsNow.filter(before), notesNow.filter(before)),
            later: stampOf(rowsNow.filter((r) => !before(r)), notesNow.filter((r) => !before(r))),
        };
    }

    it('どこで区切っても、合成した目印は範囲全体の目印と同じ', () => {
        const whole = stampOf(rows, notes);
        for (const cut of days) {
            const { earlier, later } = stampsSplitAt(cut, rows, notes);
            expect(combineStamps(earlier, later), `cut=${cut}`).toBe(whole);
        }
    });

    it('旧範囲のメモが後から編集されたら、広げた分の編集が新しくても食い違う(sol の指摘)', () => {
        const cut = '2026-11-04';
        // 旧範囲を読んだ時点(11-02 のメモは 02:00)と、広げた分を読む時点(11-05 のメモが 11-10)。
        const loadedNotes: Row[] = [
            { day: '2026-11-02', updatedAt: '2026-11-02T00:00:00+00:00', revision: 0 },
            { day: '2026-11-05', updatedAt: '2026-11-08T00:00:00.9+00:00', revision: 0 },
        ];
        const loadedEarlier = stampsSplitAt(cut, rows, loadedNotes).earlier;
        const chunkLater = stampsSplitAt(cut, rows, [
            { day: '2026-11-02', updatedAt: '2026-11-09T12:00:00+00:00', revision: 0 },
            { day: '2026-11-05', updatedAt: '2026-11-10T00:00:00+00:00', revision: 0 },
        ]).later;
        const held = combineStamps(loadedEarlier, chunkLater);
        // 次の復帰で取る範囲全体の目印(11-02 のメモは他端末で編集済み)。
        const serverNow = stampOf(rows, [
            { day: '2026-11-02', updatedAt: '2026-11-09T12:00:00+00:00', revision: 0 },
            { day: '2026-11-05', updatedAt: '2026-11-10T00:00:00+00:00', revision: 0 },
        ]);
        expect(held).not.toBe(serverNow);
    });
});
