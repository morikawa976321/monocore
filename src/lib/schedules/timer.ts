import { localTimeToUtc, utcToLocalTime } from '../date';
import { dayContentToScheduleItems } from './text-format';

/**
 * タイマーの状態(本人指定 2026-10-27: 状態は「予定中」と「予定なし」の2つだけ)。
 * - active: 今の時刻を含む予定がある。start〜end を測る。
 * - idle: 今の時刻を含む予定が無い。今日まだ次の予定があれば、前の予定の終わり(無ければ今)から次の開始までを測る。
 * 時刻はすべて epoch ミリ秒。
 */
export type TimerState =
    | { kind: 'active'; activity: string; start: number; end: number; next: { activity: string; start: number } | null }
    | { kind: 'idle'; next: { activity: string; start: number; since: number } | null };

type Block = { activity: string; start: number; end: number };

/** 複数行の予定は1行目だけを名前に使う(ヘッダーとタブ名に収まらないため)。 */
function firstLine(activity: string): string {
    return activity.split('\n')[0].trim();
}

/**
 * 1日分の予定テキストから、時刻 now のタイマーの状態を返す。
 * 終了の無い行(起床)は時点なので測らない。起床から最初の予定までは「予定なし」で、最初の予定までを測る。
 * 予定が重なっているときは、後に始まった予定を今の予定とする(長い枠の中に短い予定を入れた書き方を想定)。
 */
export function timerStateAt(dateStr: string, content: string, timezone: string, now: number): TimerState {
    const items = dayContentToScheduleItems(dateStr, content, timezone);
    const blocks: Block[] = items
        .filter((item) => item.end_at !== null)
        .map((item) => ({
            activity: firstLine(item.activity),
            start: Date.parse(item.start_at),
            // 終了の 2359 は24時として数える(free-time.ts と同じ。テキストに 2400 は書けない)。
            end: Date.parse(item.end_at!) + (utcToLocalTime(item.end_at!, timezone).hhmm === '2359' ? 60_000 : 0),
        }))
        .filter((b) => b.end > b.start)
        .sort((a, b) => a.start - b.start);

    const nextAfter = (t: number) => blocks.find((b) => b.start > t) ?? null;

    const current = blocks.filter((b) => b.start <= now && now < b.end).at(-1);
    if (current) {
        const next = nextAfter(now);
        return {
            kind: 'active',
            activity: current.activity,
            start: current.start,
            end: current.end,
            next: next && { activity: next.activity, start: next.start },
        };
    }

    const next = nextAfter(now);
    if (!next) return { kind: 'idle', next: null };
    // 測り始めは、直前に終わった予定の終わりか、直前の起床(終了の無い行)の時刻。どちらも無ければその日の 0:00。
    // 「今」にすると毎秒動いてバーが常に満杯になる。
    const boundaries = [
        localTimeToUtc(dateStr, '0000', timezone),
        ...blocks.map((b) => b.end),
        ...items.filter((item) => item.end_at === null).map((item) => Date.parse(item.start_at)),
    ].map((t) => (typeof t === 'string' ? Date.parse(t) : t));
    const since = Math.max(...boundaries.filter((t) => t <= now));
    return { kind: 'idle', next: { activity: next.activity, start: next.start, since } };
}

/** 残り時間の表示。1時間以上は H:MM:SS、未満は M:SS(端数の秒は切り上げ、0 になった瞬間に次の状態へ移る)。 */
export function formatRemaining(ms: number): string {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
