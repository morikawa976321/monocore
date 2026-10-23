/** Month serials avoid timezone and end-of-month date arithmetic. */
export function monthNumber(month: string): number {
    if (!/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('月は YYYY-MM で入力してください。');
    return Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1;
}

export function monthFromNumber(value: number): string {
    if (!Number.isInteger(value) || value < 12 || value > 119999) throw new Error('月が扱える範囲を超えています。');
    return `${String(Math.floor(value / 12)).padStart(4, '0')}-${String(value % 12 + 1).padStart(2, '0')}`;
}

export function addMonths(month: string, count: number): string {
    return monthFromNumber(monthNumber(month) + count);
}

export function toMonthDate(month: string): string {
    monthNumber(month);
    return `${month}-01`;
}

export function fromMonthDate(date: string): string {
    if (!date.endsWith('-01')) throw new Error('月初の日付が必要です。');
    const month = date.slice(0, -3);
    monthNumber(month);
    return month;
}

export function formatMonth(month: string): string {
    monthNumber(month);
    return month;
}

/** 日本時間での今月(YYYY-MM)。 */
export function currentMonth(): string {
    return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }).slice(0, 7);
}
