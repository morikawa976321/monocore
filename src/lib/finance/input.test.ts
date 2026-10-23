import { describe, expect, it } from 'vitest';
import { isTransfer, parseEvent, signedYen, type EventDraft } from './input';

const draft = (patch: Partial<EventDraft>): EventDraft => ({ id: null, name: '積立', start: '2026-01', end: '', cash: '-30,000', nisa: '0', memo: '', transfer: false, ...patch });

describe('NISA との振替', () => {
    it('振替なら NISA は Cash の符号を返した額になり、NISA 欄の値は無視する', () => {
        expect(parseEvent(draft({ transfer: true, nisa: '999' })).nisa).toBe(30000);
        expect(parseEvent(draft({ transfer: true, cash: '+500,000' })).nisa).toBe(-500000);
    });

    it('Cash が 0 の振替でも NISA は -0 にならない', () => {
        expect(Object.is(parseEvent(draft({ transfer: true, cash: '0' })).nisa, 0)).toBe(true);
    });

    it('振替でなければ NISA 欄の値をそのまま使う', () => {
        expect(parseEvent(draft({ nisa: '12,000' })).nisa).toBe(12000);
    });

    it('nisa = -cash で 0 でない行だけを振替とみなす', () => {
        expect(isTransfer({ cash: -30000, nisa: 30000 })).toBe(true);
        expect(isTransfer({ cash: 0, nisa: 0 })).toBe(false);
        expect(isTransfer({ cash: 500000, nisa: -400000 })).toBe(false);
    });
});

describe('signedYen', () => {
    it('正の値だけ + を付ける', () => {
        expect(signedYen(1000)).toBe('+1,000');
        expect(signedYen(0)).toBe('0');
        expect(signedYen(-1000)).toBe('-1,000');
    });
});
