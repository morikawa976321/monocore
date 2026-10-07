/**
 * /plan の目標の入力欄（期日・必要時間）の文字列の読み書き。
 * 期日の書式は旧 tasks ページの締切入力（src/lib/tasks/due-date.ts、46d1b4f で削除）を引き継ぐ。
 */

/** 期日。dueTime が null ならその日の終わり。 */
export type DueInput = { dueOn: string; dueTime: string | null };

function pad2(n: number): string {
    return String(n).padStart(2, '0');
}

/** 実在する日付・時刻なら YYYY-MM-DD を返す（2/30 や 24:00 を弾く）。 */
function validDate(year: number, month: number, day: number): string | null {
    const d = new Date(Date.UTC(year, month - 1, day));
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
    return `${year}-${pad2(month)}-${pad2(day)}`;
}

function validTime(hour: number, minute: number): string | null {
    if (hour > 23 || minute > 59) return null;
    return `${pad2(hour)}:${pad2(minute)}`;
}

/** 年の無い入力に、今以降で最も近い年を補う（旧 tasks と同じく8年先まで探す）。 */
function nearestFutureYear(
    month: number,
    day: number,
    minutes: number,
    today: string,
    nowMinutes: number
): number {
    const baseYear = Number(today.slice(0, 4));
    for (let offset = 0; offset <= 8; offset += 1) {
        const date = validDate(baseYear + offset, month, day);
        if (!date) continue;
        if (date > today || (date === today && minutes >= nowMinutes)) return baseYear + offset;
    }
    return baseYear;
}

function withTime(date: string | null, hour: number, minute: number): DueInput | null {
    const time = validTime(hour, minute);
    return date && time ? { dueOn: date, dueTime: time } : null;
}

/**
 * 数字だけの期日入力を読む（数字以外は無視）。
 * YYYYMMDDHHMM / YYYYMMDD / MMDDHHMM / MMDD。年が無ければ今以降で最も近い年、時刻が無ければその日の終わり。
 * 8桁は先頭4桁が 1900 以上なら YYYYMMDD、そうでなければ MMDDHHMM と読む。
 */
export function parseDueInput(raw: string, today: string, nowMinutes: number): DueInput | null {
    const digits = raw.replace(/\D/g, '');
    const n = (from: number, to: number) => Number(digits.slice(from, to));

    if (digits.length === 12) return withTime(validDate(n(0, 4), n(4, 6), n(6, 8)), n(8, 10), n(10, 12));

    if (digits.length === 8) {
        if (n(0, 4) >= 1900) {
            const date = validDate(n(0, 4), n(4, 6), n(6, 8));
            return date ? { dueOn: date, dueTime: null } : null;
        }
        const [month, day, hour, minute] = [n(0, 2), n(2, 4), n(4, 6), n(6, 8)];
        if (!validTime(hour, minute)) return null;
        const year = nearestFutureYear(month, day, hour * 60 + minute, today, nowMinutes);
        return withTime(validDate(year, month, day), hour, minute);
    }

    if (digits.length === 4) {
        const [month, day] = [n(0, 2), n(2, 4)];
        const date = validDate(nearestFutureYear(month, day, 24 * 60, today, nowMinutes), month, day);
        return date ? { dueOn: date, dueTime: null } : null;
    }

    return null;
}

/** 保存済みの期日を入力欄に戻す形（YYYYMMDD か YYYYMMDDHHMM）。dueTime は "HH:MM" でも "HH:MM:SS" でもよい。 */
export function toDueInputString(dueOn: string, dueTime: string | null): string {
    const date = dueOn.replaceAll('-', '');
    return dueTime ? `${date}${dueTime.slice(0, 5).replace(':', '')}` : date;
}

/** 必要時間（時間、小数可）を分で返す。空は 0。数でなければ null。 */
export function parseNeedInput(raw: string): number | null {
    const v = raw.trim();
    if (v === '') return 0;
    if (!/^\d+(\.\d+)?$/.test(v)) return null;
    return Math.round(Number(v) * 60);
}
