import { TIME_LINE_REGEX, isValidHhmm } from './text-format';

/**
 * 1日分の予定テキストから「空き時間」を求める。スケジュール画面の日カードと /plan の両方が使う。
 *
 * 予定の多くは終了時刻を持たない（「1050 院生ゼミ」）ので、長さの推定ルールが数字を左右する。
 * ルールの由来と、数字が上限寄りになる理由は docs/decisions.md の /plan を参照。
 */

/** 起床・消灯の行が無い日の持ち時間。既定予定（default_schedules）の 07:00 起床・23:30 消灯と同じ。 */
export const DEFAULT_WAKE_MINUTES = 7 * 60;
export const DEFAULT_SLEEP_MINUTES = 23 * 60 + 30;
/** これ以上続く空きを「まとまった枠」とする。 */
export const DEEP_GAP_MINUTES = 120;

const SLOT_MINUTES = 5;
/** 開始時刻だけの予定が大学の時限の開始時刻に始まるなら、その時限の終わりまでとみなす。 */
const PERIOD_END_BY_START: Record<number, number> = { 650: 750, 810: 910, 920: 1020 };
/** それ以外の開始時刻だけの予定の長さ。次の予定が先に来ればそこまで。 */
const POINT_EVENT_MINUTES = 60;
/** 「出発」は次の予定までの移動とみなす（上限つき）。 */
const DEPARTURE_MAX_MINUTES = 120;

export type SegmentKind = 'fixed' | 'estimated' | 'home';
export type SlotKind = 'off' | 'free' | SegmentKind;

export type Segment = {
    start: number;
    end: number;
    kind: SegmentKind;
    activity: string;
    /** 終了時刻が書かれていたか（推定でない）。 */
    ranged: boolean;
};
export type Run = { kind: SlotKind; start: number; end: number };
export type Gap = { start: number; end: number; minutes: number; deep: boolean };
export type DayAnalysis = {
    wake: number;
    sleep: number;
    segments: Segment[];
    runs: Run[];
    gaps: Gap[];
    freeMinutes: number;
    maxGapMinutes: number;
};

type Block = { start: number; end: number | null; activity: string };

function hhmmToMinutes(hhmm: string): number {
    return parseInt(hhmm.slice(0, 2), 10) * 60 + parseInt(hhmm.slice(2, 4), 10);
}

/** dayContentToScheduleItems と同じ区切り方で、時刻ブロックを分単位で取り出す。 */
function parseBlocks(content: string): Block[] {
    const lines = content.split(/\r?\n/);
    const blocks: Block[] = [];
    let i = 0;
    while (i < lines.length) {
        const m = lines[i].match(TIME_LINE_REGEX);
        if (!m || !isValidHhmm(m[1]) || (m[3] && !isValidHhmm(m[3]))) {
            i++;
            continue;
        }
        const activityLines = [(m[5] ?? '').trim()];
        i++;
        while (i < lines.length && !TIME_LINE_REGEX.test(lines[i])) {
            activityLines.push(lines[i]);
            i++;
        }
        const activity = activityLines.join(' ').trim();
        if (activity === '') continue;
        const start = hhmmToMinutes(m[1]);
        const rawEnd = m[3] ? hhmmToMinutes(m[3]) : null;
        // 日付を跨ぐ範囲（2300-0100）はその日の終わりで切る。
        const end = rawEnd === null ? null : rawEnd <= start ? 24 * 60 : rawEnd;
        blocks.push({ start, end, activity });
    }
    return blocks;
}

export function analyzeDayContent(content: string): DayAnalysis {
    const blocks = parseBlocks(content);
    const wakeBlock = blocks.find((b) => b.activity.includes('起床'));
    const wake = wakeBlock ? wakeBlock.start : DEFAULT_WAKE_MINUTES;
    // 起床より前の「消灯」は前夜の就寝なので、その日の終わりには使わない。
    const sleepBlocks = blocks.filter((b) => b.activity.includes('消灯') && b.start > wake);
    const sleep = sleepBlocks.length > 0 ? sleepBlocks[sleepBlocks.length - 1].start : DEFAULT_SLEEP_MINUTES;

    const events = blocks
        .filter((b) => !b.activity.includes('起床') && !b.activity.includes('消灯'))
        .sort((a, b) => a.start - b.start);
    const segments: Segment[] = events.map((b) => {
        const kind: SegmentKind = b.activity.includes('受け取り') ? 'home' : b.end === null ? 'estimated' : 'fixed';
        let end = b.end;
        if (end === null) {
            const next = events.find((o) => o.start > b.start);
            const nextStart = next ? next.start : 24 * 60;
            if (b.activity.startsWith('出発')) end = Math.min(nextStart, b.start + DEPARTURE_MAX_MINUTES);
            else if (PERIOD_END_BY_START[b.start] !== undefined) end = Math.min(PERIOD_END_BY_START[b.start], nextStart);
            else end = Math.min(b.start + POINT_EVENT_MINUTES, nextStart);
        }
        return { start: b.start, end: Math.max(end, b.start + SLOT_MINUTES), kind, activity: b.activity, ranged: b.end !== null };
    });

    const slots: SlotKind[] = [];
    for (let m = 0; m < 24 * 60; m += SLOT_MINUTES) {
        let kind: SlotKind = 'free';
        if (m < wake || m >= sleep) {
            kind = 'off';
        } else {
            for (const s of segments) {
                if (m < s.start || m >= s.end) continue;
                if (s.kind === 'fixed') {
                    kind = 'fixed';
                    break;
                }
                if (s.kind === 'estimated') kind = 'estimated';
                else if (kind === 'free') kind = 'home';
            }
        }
        slots.push(kind);
    }

    const runs: Run[] = [];
    slots.forEach((kind, i) => {
        const last = runs[runs.length - 1];
        if (last && last.kind === kind) last.end = (i + 1) * SLOT_MINUTES;
        else runs.push({ kind, start: i * SLOT_MINUTES, end: (i + 1) * SLOT_MINUTES });
    });
    const gaps: Gap[] = runs
        .filter((r) => r.kind === 'free')
        .map((r) => ({ start: r.start, end: r.end, minutes: r.end - r.start, deep: r.end - r.start >= DEEP_GAP_MINUTES }));

    return {
        wake,
        sleep,
        segments,
        runs,
        gaps,
        freeMinutes: gaps.reduce((sum, g) => sum + g.minutes, 0),
        maxGapMinutes: gaps.reduce((max, g) => Math.max(max, g.minutes), 0),
    };
}

/**
 * [from, to) のうち使える空きの分数。lifeMinutesPerDay（食事・移動・風呂など予定に書かない
 * 生活の時間）を、持ち時間に占める割合で按分して差し引く。
 */
export function usableFreeMinutes(
    day: DayAnalysis,
    from: number,
    to: number,
    lifeMinutesPerDay: number
): number {
    const start = Math.max(from, day.wake);
    const end = Math.min(to, day.sleep);
    if (end <= start) return 0;
    const free = day.gaps.reduce((sum, g) => sum + Math.max(0, Math.min(g.end, end) - Math.max(g.start, start)), 0);
    const window = Math.max(1, day.sleep - day.wake);
    return Math.max(0, free - (lifeMinutesPerDay * (end - start)) / window);
}

/** YYYY-MM-DD に日数を足す（タイムゾーンに依存しない暦の計算）。 */
export function addDays(dateStr: string, days: number): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + days));
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** "HH:MM" または "HH:MM:SS" を分に。null は null。 */
export function timeToMinutes(time: string | null): number | null {
    if (!time) return null;
    const [h, m] = time.split(':').map(Number);
    return h * 60 + (m || 0);
}

export type GoalInput = {
    id: string;
    name: string;
    dueOn: string;
    /** 期日の時刻（分）。null ならその日の終わりまで。 */
    dueMinutes: number | null;
    needMinutes: number;
};

export type GoalStatus = {
    goal: GoalInput;
    /** 期日が今より前。間に合うかの判定から外す。 */
    past: boolean;
    /** 予定の行のうち、時刻範囲つきで名前を含むものの合計（期日まで）。 */
    placedMinutes: number;
    remainingMinutes: number;
    /** 期日の早い順に並べたときの、この目標までの残り必要時間の累計。 */
    cumulativeMinutes: number;
    /** 今から期日までに使える空き（生活時間を差し引いた後）。 */
    supplyMinutes: number;
    ok: boolean;
};

/**
 * 締切の早い順に「残り必要時間の累計 ≦ 締切までに使える空き」を確かめる。
 * 個別に足りていても、先の締切の目標が同じ空きを食うので、累計で比べる。
 */
export function evaluateGoals(params: {
    goals: GoalInput[];
    analyze: (date: string) => DayAnalysis;
    /** 置いた時間を数える対象の日（予定を読み込んだ日）。 */
    knownDates: string[];
    today: string;
    nowMinutes: number;
    lifeMinutesPerDay: number;
}): GoalStatus[] {
    const { goals, analyze, knownDates, today, nowMinutes, lifeMinutesPerDay } = params;
    const dueOf = (g: GoalInput) => g.dueMinutes ?? 24 * 60;
    const sorted = [...goals].sort((a, b) => (a.dueOn === b.dueOn ? dueOf(a) - dueOf(b) : a.dueOn < b.dueOn ? -1 : 1));
    let cumulative = 0;
    return sorted.map((goal) => {
        const due = dueOf(goal);
        const past = goal.dueOn < today || (goal.dueOn === today && due <= nowMinutes);
        const name = goal.name.trim();
        let placed = 0;
        if (name) {
            for (const date of knownDates) {
                if (date > goal.dueOn) continue;
                const limit = date === goal.dueOn ? due : 24 * 60;
                for (const s of analyze(date).segments) {
                    if (s.kind !== 'fixed' || !s.ranged || !s.activity.includes(name)) continue;
                    placed += Math.max(0, Math.min(s.end, limit) - s.start);
                }
            }
        }
        const remaining = Math.max(0, goal.needMinutes - placed);
        let supply = 0;
        if (!past) {
            for (let date = today; date <= goal.dueOn; date = addDays(date, 1)) {
                supply += usableFreeMinutes(
                    analyze(date),
                    date === today ? nowMinutes : 0,
                    date === goal.dueOn ? due : 24 * 60,
                    lifeMinutesPerDay
                );
            }
            cumulative += remaining;
        }
        return {
            goal,
            past,
            placedMinutes: placed,
            remainingMinutes: remaining,
            cumulativeMinutes: past ? 0 : cumulative,
            supplyMinutes: supply,
            ok: past || cumulative <= supply,
        };
    });
}

/** 分を「12.5」形式の時間に。 */
export function formatHours(minutes: number): string {
    return (minutes / 60).toFixed(1);
}
