import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

// ISO日時を "YYYY/MM/DD HH:mm" 形式で表示する。
export function formatDate(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
}

// ISO日時を "YYYY/MM/DD" 形式で表示する。
export function formatDateOnly(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}/${mm}/${dd}`;
}

// 不正な日付（例: 2/30）を弾いた Date を返す。
function createDateOrNull(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number
): Date | null {
    const date = new Date(year, month - 1, day, hour, minute, 0, 0);
    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day ||
        date.getHours() !== hour ||
        date.getMinutes() !== minute
    ) {
        return null;
    }
    return date;
}

// 指定した月日・時刻に対して「最も近い未来年」を選ぶ。
function resolveNearestFutureYear(month: number, day: number, hour: number, minute: number): number {
    const now = new Date();
    const baseYear = now.getFullYear();
    for (let offset = 0; offset <= 8; offset += 1) {
        const year = baseYear + offset;
        const candidate = createDateOrNull(year, month, day, hour, minute);
        if (!candidate) continue;
        if (candidate.getTime() >= now.getTime()) return year;
    }
    return baseYear;
}

// ユーザー入力の締切文字列を Date に正規化する。
export function parseDueInput(raw: string): Date | null {
    const digits = raw.replace(/\D/g, '');
    if (!digits) return null;

    // YYYYMMDDHHMM
    if (digits.length === 12) {
        const year = Number(digits.slice(0, 4));
        const month = Number(digits.slice(4, 6));
        const day = Number(digits.slice(6, 8));
        const hour = Number(digits.slice(8, 10));
        const minute = Number(digits.slice(10, 12));
        return createDateOrNull(year, month, day, hour, minute);
    }

    // YYYYMMDD または MMDDHHMM
    if (digits.length === 8) {
        const head = Number(digits.slice(0, 4));
        const tailA = Number(digits.slice(4, 6));
        const tailB = Number(digits.slice(6, 8));

        // YYYYMMDD: HHMM は 2359 を補完
        if (head >= 1900) {
            const year = head;
            const month = tailA;
            const day = tailB;
            return createDateOrNull(year, month, day, 23, 59);
        }

        // MMDDHHMM: YYYY は最も近い未来年を補完
        const month = Number(digits.slice(0, 2));
        const day = Number(digits.slice(2, 4));
        const hour = Number(digits.slice(4, 6));
        const minute = Number(digits.slice(6, 8));
        const year = resolveNearestFutureYear(month, day, hour, minute);
        return createDateOrNull(year, month, day, hour, minute);
    }

    // MMDD: HHMM は 2359, YYYY は最も近い未来年を補完
    if (digits.length === 4) {
        const month = Number(digits.slice(0, 2));
        const day = Number(digits.slice(2, 4));
        const year = resolveNearestFutureYear(month, day, 23, 59);
        return createDateOrNull(year, month, day, 23, 59);
    }

    return null;
}

// ISO日時文字列を締切入力欄の初期値（YYYYMMDDHHMM 形式）に変換する。
export function toDueInputString(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    if (hh === '23' && min === '59') return `${yyyy}${mm}${dd}`;
    return `${yyyy}${mm}${dd}${hh}${min}`;
}

export type DueKind = 'overdue' | 'today';

// due_at のローカル日付を todayStr と比較し、期限切れ・今日・未来を判定する。
export function classifyDue(dueAtIso: string | null, todayStr: string, tz: string): DueKind | null {
    if (!dueAtIso) return null;
    try {
        const d = new Date(dueAtIso);
        if (isNaN(d.getTime())) return null;
        const zonedDate = toZonedTime(d, tz);
        const dueDateStr = format(zonedDate, 'yyyy-MM-dd');
        if (dueDateStr < todayStr) return 'overdue';
        if (dueDateStr === todayStr) return 'today';
        return null;
    } catch {
        return null;
    }
}
