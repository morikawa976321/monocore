import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseDueInput, toDueInputString, classifyDue } from './due-date';

function expectDateParts(
    date: Date | null,
    expected: {
        year: number;
        month: number;
        day: number;
        hour: number;
        minute: number;
    }
) {
    expect(date).not.toBeNull();
    expect(date?.getFullYear()).toBe(expected.year);
    expect(date?.getMonth()).toBe(expected.month - 1);
    expect(date?.getDate()).toBe(expected.day);
    expect(date?.getHours()).toBe(expected.hour);
    expect(date?.getMinutes()).toBe(expected.minute);
}

describe('parseDueInput', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns null for empty or non-digit input', () => {
        expect(parseDueInput('')).toBeNull();
        expect(parseDueInput('abc')).toBeNull();
        expect(parseDueInput('12')).toBeNull();
    });

    it('parses YYYYMMDDHHMM as exact local datetime', () => {
        const result = parseDueInput('202603182359');
        expectDateParts(result, { year: 2026, month: 3, day: 18, hour: 23, minute: 59 });
    });

    it('parses YYYYMMDD and complements time to 23:59', () => {
        const result = parseDueInput('20260318');
        expectDateParts(result, { year: 2026, month: 3, day: 18, hour: 23, minute: 59 });
    });

    it('parses MMDDHHMM and selects nearest future year', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 2, 18, 10, 0, 0));

        const sameDayFuture = parseDueInput('03181030');
        expectDateParts(sameDayFuture, { year: 2026, month: 3, day: 18, hour: 10, minute: 30 });

        const passedSameDay = parseDueInput('03180930');
        expectDateParts(passedSameDay, { year: 2027, month: 3, day: 18, hour: 9, minute: 30 });
    });

    it('parses MMDD and selects nearest future year with 23:59', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 2, 19, 0, 0, 0));

        const futureInSameYear = parseDueInput('0320');
        expectDateParts(futureInSameYear, { year: 2026, month: 3, day: 20, hour: 23, minute: 59 });

        const rolledToNextYear = parseDueInput('0318');
        expectDateParts(rolledToNextYear, { year: 2027, month: 3, day: 18, hour: 23, minute: 59 });
    });

    it('returns null for impossible dates', () => {
        expect(parseDueInput('202602302359')).toBeNull();
        expect(parseDueInput('20260230')).toBeNull();
        expect(parseDueInput('0231')).toBeNull();
    });
});

describe('toDueInputString', () => {
    it('returns empty string for null', () => {
        expect(toDueInputString(null)).toBe('');
    });

    it('returns empty string for invalid ISO string', () => {
        expect(toDueInputString('not-a-date')).toBe('');
    });

    it('returns YYYYMMDDHHMM for non-2359 time', () => {
        const iso = new Date(2026, 2, 18, 14, 30).toISOString();
        expect(toDueInputString(iso)).toBe('202603181430');
    });

    it('omits HHMM when time is 23:59', () => {
        const iso = new Date(2026, 2, 18, 23, 59).toISOString();
        expect(toDueInputString(iso)).toBe('20260318');
    });

    it('returns YYYYMMDDHHMM for midnight (00:00)', () => {
        const iso = new Date(2026, 0, 1, 0, 0).toISOString();
        expect(toDueInputString(iso)).toBe('202601010000');
    });
});

describe('classifyDue', () => {
    it('returns null for null dueAtIso', () => {
        expect(classifyDue(null, '2026-07-17', 'Asia/Tokyo')).toBeNull();
    });

    it('returns null for invalid ISO string', () => {
        expect(classifyDue('not-a-date', '2026-07-17', 'Asia/Tokyo')).toBeNull();
    });

    it('returns "overdue" when due date is before today', () => {
        const dueAtIso = '2026-07-15T10:00:00Z';
        expect(classifyDue(dueAtIso, '2026-07-17', 'Asia/Tokyo')).toBe('overdue');
    });

    it('returns "today" when due date is today', () => {
        const dueAtIso = '2026-07-17T10:00:00Z';
        expect(classifyDue(dueAtIso, '2026-07-17', 'Asia/Tokyo')).toBe('today');
    });

    it('returns null when due date is in the future', () => {
        const dueAtIso = '2026-07-20T10:00:00Z';
        expect(classifyDue(dueAtIso, '2026-07-17', 'Asia/Tokyo')).toBeNull();
    });

    it('handles JST boundary case: UTC 2026-07-16 15:30 (JST 07-17 00:30) is today', () => {
        const dueAtIso = '2026-07-16T15:30:00Z';
        expect(classifyDue(dueAtIso, '2026-07-17', 'Asia/Tokyo')).toBe('today');
    });

    it('handles JST boundary case: UTC 2026-07-16 14:59 (JST 07-16 23:59) is overdue', () => {
        const dueAtIso = '2026-07-16T14:59:00Z';
        expect(classifyDue(dueAtIso, '2026-07-17', 'Asia/Tokyo')).toBe('overdue');
    });
});
