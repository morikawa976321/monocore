import { describe, expect, it } from 'vitest';
import { formatRemaining, timerStateAt } from './timer';

const TZ = 'Asia/Tokyo';
const DAY = '2026-10-27';
const at = (hhmm: string, sec = 0) =>
    Date.parse(`${DAY}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:${String(sec).padStart(2, '0')}+09:00`);

const CONTENT = ['0700 起床', '1330-1530 研究', '進捗をまとめる', '1530-1600 メール', '1630-1700 BM'].join('\n');

describe('timerStateAt', () => {
    it('今を含む予定があれば予定中で、その予定と次の予定を返す', () => {
        expect(timerStateAt(DAY, CONTENT, TZ, at('1400'))).toEqual({
            kind: 'active',
            activity: '研究',
            start: at('1330'),
            end: at('1530'),
            next: { activity: 'メール', start: at('1530') },
        });
    });

    it('予定が連続しているとき、境目の時刻は後の予定に入る', () => {
        const s = timerStateAt(DAY, CONTENT, TZ, at('1530'));
        expect(s.kind === 'active' && s.activity).toBe('メール');
    });

    it('予定の隙間は予定なしで、直前の予定の終わりから次の開始までを測る', () => {
        expect(timerStateAt(DAY, CONTENT, TZ, at('1610'))).toEqual({
            kind: 'idle',
            next: { activity: 'BM', start: at('1630'), since: at('1600') },
        });
    });

    it('起床から最初の予定までは、起床の時刻から測る', () => {
        expect(timerStateAt(DAY, CONTENT, TZ, at('0900'))).toEqual({
            kind: 'idle',
            next: { activity: '研究', start: at('1330'), since: at('0700') },
        });
    });

    it('起床の行も予定も前に無ければ、その日の 0:00 から測る', () => {
        const s = timerStateAt(DAY, '1330-1530 研究', TZ, at('0100'));
        expect(s).toEqual({ kind: 'idle', next: { activity: '研究', start: at('1330'), since: at('0000') } });
    });

    it('今日の最後の予定が終わったら、次の無い予定なし', () => {
        expect(timerStateAt(DAY, CONTENT, TZ, at('1800'))).toEqual({ kind: 'idle', next: null });
    });

    it('予定が重なっていたら、後に始まった予定を今の予定とする', () => {
        const s = timerStateAt(DAY, '1300-1700 研究\n1400-1430 打合せ', TZ, at('1410'));
        expect(s.kind === 'active' && [s.activity, s.end]).toEqual(['打合せ', at('1430')]);
    });

    it('終了の 2359 は24時として数える', () => {
        const s = timerStateAt(DAY, '2200-2359 作業', TZ, at('2359', 30));
        expect(s.kind === 'active' && s.end).toBe(at('2359') + 60_000);
        expect(timerStateAt(DAY, '2359-2359 作業', TZ, at('2359', 30)).kind).toBe('active');
    });

    it('不正な行は無視する', () => {
        expect(timerStateAt(DAY, 'メモだけの行\n2500-2600 不正', TZ, at('1200'))).toEqual({ kind: 'idle', next: null });
    });
});

describe('formatRemaining', () => {
    it('1時間以上は H:MM:SS、未満は M:SS で、端数の秒は切り上げる', () => {
        expect(formatRemaining(4350_000)).toBe('1:12:30');
        expect(formatRemaining(252_000)).toBe('4:12');
        expect(formatRemaining(59_001)).toBe('1:00');
        expect(formatRemaining(-5)).toBe('0:00');
    });
});
