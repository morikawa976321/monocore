import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseDueInput } from './due-date';

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
