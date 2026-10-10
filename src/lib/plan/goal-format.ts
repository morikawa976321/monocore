/**
 * /plan とスケジュール画面の目標の帯が共有する、目標の表示用の計算。
 * 判定そのもの（累計・締切までの空き）は src/lib/schedules/free-time.ts の evaluateGoals が持ち、
 * ここはその結果を表示の形（期日の文字列・余裕か不足か・置いた割合）にするだけ。
 */
import type { GoalStatus } from '@/src/lib/schedules/free-time';

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** "10/16 金 10:50"（時刻が無ければ日付と曜日だけ）。月日はゼロ埋めしない。 */
export function formatDue(dueOn: string, dueMinutes: number | null): string {
    const [y, m, d] = dueOn.split('-').map(Number);
    const dow = DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    const time =
        dueMinutes === null
            ? ''
            : ` ${String(Math.floor(dueMinutes / 60)).padStart(2, '0')}:${String(dueMinutes % 60).padStart(2, '0')}`;
    return `${m}/${d} ${dow}${time}`;
}

export type GoalVerdictResult =
    | { kind: 'past' }
    /** 余裕 = 締切までの空き − 残り必要時間の累計（ちょうど 0 も余裕側）。 */
    | { kind: 'ok'; marginMinutes: number }
    | { kind: 'short'; deficitMinutes: number };

/** 余裕（締切までの空き − 残り必要時間の累計）か、不足を出す。 */
export function goalVerdict(status: GoalStatus): GoalVerdictResult {
    if (status.past) return { kind: 'past' };
    if (status.ok) return { kind: 'ok', marginMinutes: status.supplyMinutes - status.cumulativeMinutes };
    return { kind: 'short', deficitMinutes: status.cumulativeMinutes - status.supplyMinutes };
}

/** 置いた時間 / 必要な時間（0..1）。必要な時間が 0 なら 0、置きすぎは 1 で止める。 */
export function placedRatio(placedMinutes: number, needMinutes: number): number {
    return needMinutes > 0 ? Math.min(1, placedMinutes / needMinutes) : 0;
}
