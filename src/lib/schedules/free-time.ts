import { TIME_LINE_REGEX, isValidHhmm } from './text-format';

/**
 * 1日分の予定テキストから「空き時間（自由時間）」を求める。スケジュール画面の日カードと /plan の両方が使う。
 *
 * 予定は起床を除いてすべて開始と終了を持つ前提（終了の無い予定・終了が開始より前の予定は
 * text-format.ts の findDayContentIssues が不正として保存前に弾く）。1日は3つに分かれる:
 * - 睡眠: 起床より前と、消灯の予定が終わった後
 * - 非自由: 予定の時間（消灯の予定を含む）と、起床から最初の予定までの身支度（最大2時間）
 * - 自由: それ以外
 * 規則の由来は docs/decisions.md の /plan。
 */

/** 起床の行が無い日の起床時刻。既定予定（default_schedules）の 0700 起床と同じ。 */
export const DEFAULT_WAKE_MINUTES = 7 * 60;
/** 消灯の行が無い日の消灯。既定予定の 2200-2300 消灯と同じ。終わった時刻から睡眠。 */
export const DEFAULT_LIGHTS_OUT = { start: 22 * 60, end: 23 * 60 } as const;
/** 起床から最初の予定までを身支度として非自由にする。それより長く空いていても、この長さまで。 */
export const MORNING_MAX_MINUTES = 120;

const DAY_MINUTES = 24 * 60;

export type SlotKind = 'sleep' | 'busy' | 'free';
export type Run = { kind: SlotKind; start: number; end: number };
export type DayEvent = { start: number; end: number; activity: string };
export type DayAnalysis = {
    wake: number;
    /** 睡眠に入る時刻（消灯の予定の終わり）。 */
    sleep: number;
    /** 時刻範囲を持つ予定（起床を除く）。置いた時間の集計に使う。 */
    events: DayEvent[];
    runs: Run[];
    freeMinutes: number;
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
        blocks.push({ start: hhmmToMinutes(m[1]), end: m[3] ? hhmmToMinutes(m[3]) : null, activity });
    }
    return blocks;
}

export function analyzeDayContent(content: string): DayAnalysis {
    const blocks = parseBlocks(content);
    const wakeBlock = blocks.find((b) => b.activity.includes('起床'));
    const wake = wakeBlock ? wakeBlock.start : DEFAULT_WAKE_MINUTES;
    // 時刻範囲を持つ予定だけを数える。終了の無い行・終了が開始より前の行は保存前に弾かれるが、
    // 規則を入れる前に保存された古い行が残っていても数えない。
    const events: DayEvent[] = blocks
        .filter((b): b is Block & { end: number } => b !== wakeBlock && b.end !== null && b.end > b.start)
        .map((b) => ({ start: b.start, end: b.end, activity: b.activity }))
        .sort((a, b) => a.start - b.start);

    // 消灯の予定（起床より後の最後のもの）が終わった時刻から睡眠。無ければ既定の 2200-2300。
    const lightsOut = [...events].reverse().find((e) => e.activity.includes('消灯') && e.start > wake);
    const sleep = lightsOut ? lightsOut.end : DEFAULT_LIGHTS_OUT.end;
    const busy: { start: number; end: number }[] = lightsOut ? [...events] : [...events, DEFAULT_LIGHTS_OUT];

    // 起床から最初の予定まで（最大2時間）は身支度として非自由。起床の時点で続いている予定があれば0。
    const firstStart = busy
        .filter((e) => e.end > wake)
        .reduce((min, e) => Math.min(min, Math.max(e.start, wake)), sleep);
    busy.push({ start: wake, end: Math.min(wake + MORNING_MAX_MINUTES, firstStart) });

    const slots: SlotKind[] = Array.from({ length: DAY_MINUTES }, (_, m) => (m < wake || m >= sleep ? 'sleep' : 'free'));
    for (const b of busy) {
        for (let m = Math.max(b.start, wake); m < Math.min(b.end, sleep); m++) slots[m] = 'busy';
    }

    const runs: Run[] = [];
    slots.forEach((kind, m) => {
        const last = runs[runs.length - 1];
        if (last && last.kind === kind) last.end = m + 1;
        else runs.push({ kind, start: m, end: m + 1 });
    });

    return {
        wake,
        sleep,
        events,
        runs,
        freeMinutes: runs.filter((r) => r.kind === 'free').reduce((sum, r) => sum + r.end - r.start, 0),
    };
}

/** [from, to) に含まれる自由時間の分数。 */
export function freeMinutesBetween(day: DayAnalysis, from: number, to: number): number {
    return day.runs
        .filter((r) => r.kind === 'free')
        .reduce((sum, r) => sum + Math.max(0, Math.min(r.end, to) - Math.max(r.start, from)), 0);
}

/** YYYY-MM-DD に日数を足す（タイムゾーンに依存しない暦の計算）。 */
export function addDays(dateStr: string, days: number): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + days));
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** a から b までの日数（b が後なら正）。 */
export function daysBetween(a: string, b: string): number {
    const toUtc = (s: string) => {
        const [y, m, d] = s.split('-').map(Number);
        return Date.UTC(y, m - 1, d);
    };
    return Math.round((toUtc(b) - toUtc(a)) / 86400000);
}

/**
 * 予定の内容が目標の名前を「語として」含むか。名前の前後が行頭・行末か空白（スペース・改行）のときだけ
 * 当たる。"xyz" に対して "xyz" "xyz abc" は当たり、"xyzabc" "abcxyz" は当たらない。
 * 複数行の予定は parseBlocks が空白でつないでいるので、改行も空白として扱われる。
 */
export function activityMatchesName(activity: string, name: string): boolean {
    if (!name) return false;
    for (let i = activity.indexOf(name); i !== -1; i = activity.indexOf(name, i + 1)) {
        const before = i === 0 || /\s/.test(activity[i - 1]);
        const end = i + name.length;
        const after = end === activity.length || /\s/.test(activity[end]);
        if (before && after) return true;
    }
    return false;
}

/** 予定の無い日（0700 起床・2200-2300 消灯だけの日）。読み込んでいない日の代わりに使う。 */
export const EMPTY_DAY = analyzeDayContent('');

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
    /** 予定のうち、名前を語として含むものの、現在時刻から期日までの合計。 */
    placedMinutes: number;
    remainingMinutes: number;
    /** 期日の早い順に並べたときの、この目標までの残り必要時間の累計。 */
    cumulativeMinutes: number;
    /** 今から期日までの自由時間。 */
    supplyMinutes: number;
    ok: boolean;
};

/**
 * 締切の早い順に「残り必要時間の累計 ≦ 締切までの自由時間」を確かめる。
 * 個別に足りていても、先の締切の目標が同じ自由時間を食うので、累計で比べる。
 */
export function evaluateGoals(params: {
    goals: GoalInput[];
    /** 予定を読み込んだ日の解析。無い日は予定の無い日（EMPTY_DAY）として数える。 */
    days: Map<string, DayAnalysis>;
    today: string;
    nowMinutes: number;
}): GoalStatus[] {
    const { goals, days, today, nowMinutes } = params;
    const knownDates = [...days.keys()].sort();
    const dueOf = (g: GoalInput) => g.dueMinutes ?? DAY_MINUTES;
    const sorted = [...goals].sort((a, b) => (a.dueOn === b.dueOn ? dueOf(a) - dueOf(b) : a.dueOn < b.dueOn ? -1 : 1));
    const freeOn = (date: string, from: number, to: number) => freeMinutesBetween(days.get(date) ?? EMPTY_DAY, from, to);
    let cumulative = 0;
    return sorted.map((goal) => {
        const due = dueOf(goal);
        const past = goal.dueOn < today || (goal.dueOn === today && due <= nowMinutes);
        const name = goal.name.trim();
        // 置いた時間は、現在時刻より後の分だけ（過去の予定と、今日の今までの分は数えない）。
        let placed = 0;
        if (name) {
            for (const date of knownDates) {
                if (date < today || date > goal.dueOn) continue;
                const floor = date === today ? nowMinutes : 0;
                const limit = date === goal.dueOn ? due : DAY_MINUTES;
                for (const e of days.get(date)!.events) {
                    if (!activityMatchesName(e.activity, name)) continue;
                    placed += Math.max(0, Math.min(e.end, limit) - Math.max(e.start, floor));
                }
            }
        }
        const remaining = Math.max(0, goal.needMinutes - placed);
        let supply = 0;
        if (!past) {
            // 読み込んだ日は1日ずつ、それ以外は予定の無い日の自由時間 × 日数。期日が何年先でも
            // 日数に比例した計算をしない（年の打ち間違いで画面が固まらないように）。
            const inRange = knownDates.filter((d) => d >= today && d <= goal.dueOn);
            for (const date of inRange) {
                supply += freeOn(date, date === today ? nowMinutes : 0, date === goal.dueOn ? due : DAY_MINUTES);
            }
            const known = new Set(inRange);
            let unknownWholeDays = daysBetween(today, goal.dueOn) + 1 - inRange.length;
            if (!known.has(today)) {
                supply += freeOn(today, nowMinutes, today === goal.dueOn ? due : DAY_MINUTES);
                unknownWholeDays -= 1;
            }
            if (goal.dueOn !== today && !known.has(goal.dueOn)) {
                supply += freeOn(goal.dueOn, 0, due);
                unknownWholeDays -= 1;
            }
            supply += Math.max(0, unknownWholeDays) * EMPTY_DAY.freeMinutes;
            cumulative += remaining;
        }
        return {
            goal,
            past,
            placedMinutes: placed,
            remainingMinutes: remaining,
            cumulativeMinutes: past ? 0 : cumulative,
            supplyMinutes: supply,
            // 自分の残りが 0 なら、足りないのは先の締切の目標であって、この目標ではない。
            ok: past || remaining === 0 || cumulative <= supply,
        };
    });
}

/** 分を「12.5」形式の時間に。 */
export function formatHours(minutes: number): string {
    return (minutes / 60).toFixed(1);
}
