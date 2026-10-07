import { describe, expect, it } from 'vitest';
import { parseDueInput, parseNeedInput, toDueInputString } from './goal-input';

// 今 = 2026-03-18 10:00
const TODAY = '2026-03-18';
const NOW = 600;

describe('parseDueInput', () => {
    it('returns null for empty, non-digit or unsupported lengths', () => {
        expect(parseDueInput('', TODAY, NOW)).toBeNull();
        expect(parseDueInput('abc', TODAY, NOW)).toBeNull();
        expect(parseDueInput('12', TODAY, NOW)).toBeNull();
        expect(parseDueInput('202603', TODAY, NOW)).toBeNull();
    });

    it('parses YYYYMMDDHHMM', () => {
        expect(parseDueInput('202603182359', TODAY, NOW)).toEqual({ dueOn: '2026-03-18', dueTime: '23:59' });
        expect(parseDueInput('2026/03/18 14:30', TODAY, NOW)).toEqual({ dueOn: '2026-03-18', dueTime: '14:30' });
    });

    it('parses YYYYMMDD as the end of the day, past dates included', () => {
        expect(parseDueInput('20260318', TODAY, NOW)).toEqual({ dueOn: '2026-03-18', dueTime: null });
        expect(parseDueInput('20250101', TODAY, NOW)).toEqual({ dueOn: '2025-01-01', dueTime: null });
    });

    it('parses MMDDHHMM with the nearest year from now', () => {
        expect(parseDueInput('03181030', TODAY, NOW)).toEqual({ dueOn: '2026-03-18', dueTime: '10:30' });
        expect(parseDueInput('03180930', TODAY, NOW)).toEqual({ dueOn: '2027-03-18', dueTime: '09:30' });
    });

    it('parses MMDD as the end of the day with the nearest year from now', () => {
        expect(parseDueInput('0318', TODAY, NOW)).toEqual({ dueOn: '2026-03-18', dueTime: null });
        expect(parseDueInput('0320', TODAY, NOW)).toEqual({ dueOn: '2026-03-20', dueTime: null });
        expect(parseDueInput('0317', TODAY, NOW)).toEqual({ dueOn: '2027-03-17', dueTime: null });
        expect(parseDueInput('0229', TODAY, NOW)).toEqual({ dueOn: '2028-02-29', dueTime: null });
    });

    it('returns null for impossible dates and times', () => {
        expect(parseDueInput('202602302359', TODAY, NOW)).toBeNull();
        expect(parseDueInput('20260230', TODAY, NOW)).toBeNull();
        expect(parseDueInput('0231', TODAY, NOW)).toBeNull();
        expect(parseDueInput('202603182400', TODAY, NOW)).toBeNull();
        expect(parseDueInput('03181260', TODAY, NOW)).toBeNull();
    });
});

describe('toDueInputString', () => {
    it('omits the time when there is none', () => {
        expect(toDueInputString('2026-03-18', null)).toBe('20260318');
    });

    it('keeps the time, from either HH:MM or HH:MM:SS', () => {
        expect(toDueInputString('2026-03-18', '14:30:00')).toBe('202603181430');
        expect(toDueInputString('2026-01-01', '00:00')).toBe('202601010000');
    });

    it('round-trips through parseDueInput', () => {
        const due = { dueOn: '2026-10-20', dueTime: '09:05' };
        expect(parseDueInput(toDueInputString(due.dueOn, due.dueTime), TODAY, NOW)).toEqual(due);
    });
});

describe('parseNeedInput', () => {
    it('reads hours as minutes, empty as 0', () => {
        expect(parseNeedInput('')).toBe(0);
        expect(parseNeedInput(' 12 ')).toBe(720);
        expect(parseNeedInput('1.5')).toBe(90);
    });

    it('returns null for anything else', () => {
        expect(parseNeedInput('-1')).toBeNull();
        expect(parseNeedInput('1h')).toBeNull();
        expect(parseNeedInput('abc')).toBeNull();
    });
});
