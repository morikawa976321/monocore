import { TIME_LINE_REGEX, isValidHhmm } from './text-format';

/**
 * 予定テキストから「空き時間（自由時間）」を求める。スケジュール画面の日カードと /plan の両方が使う。
 *
 * スケジュール画面の予定を正として導出する（本人指定 2026-10-18）。時間は日をまたいで連続しており、
 * 消灯の予定が終わってから次の起床までが睡眠、起床から消灯までが起きている時間。日の境目では区切らない
 * （0000-0300 消灯 は前夜の続きで、前日に消灯の行が無ければ前日は24時まで起きている）。起床が続いたり
 * 消灯が続いたりしたら、2つ目以降は境目として無視する。
 * 予定は起床を除いてすべて開始と終了を持つ前提（終了の無い予定・終了が開始より前の予定は
 * text-format.ts の findDayContentIssues が不正として保存前に弾く）。時間は3つに分かれる:
 * - 睡眠: 消灯の予定の終わりから次の起床まで。「睡眠」を語として含む予定の時間も睡眠として塗る
 * - 非自由: 起きている間の予定の時間（消灯の予定を含む）と、起床から最初の予定までの身支度（最大2時間。
 *   起床の行が範囲を持てばその範囲）
 * - 自由: それ以外の起きている時間
 * 既定の起床・消灯は、スケジュール画面でまだ読み込んでいない日（既定予定を書き込んだ記録の無い日）に
 * だけ、その行が無いときに補う。読み込んだ日は既定予定が実データとして入っているので、行が無ければ
 * 本人が消したものとして補わない。規則の由来は docs/decisions.md の /plan。
 */

/** 読み込んでいない日に起床の行が無いときの起床時刻。既定予定（default_schedules）の 0700 起床と同じ。 */
export const DEFAULT_WAKE_MINUTES = 7 * 60;
/** 読み込んでいない日に消灯の行が無いときの消灯。既定予定の 2200-2300 消灯と同じ。終わった時刻から睡眠。 */
export const DEFAULT_LIGHTS_OUT = { start: 22 * 60, end: 23 * 60 } as const;
/** 起床から最初の予定までを身支度として非自由にする。それより長く空いていても、この長さまで。 */
export const MORNING_MAX_MINUTES = 120;

const DAY_MINUTES = 24 * 60;

export type SlotKind = 'sleep' | 'busy' | 'free';
export type Run = { kind: SlotKind; start: number; end: number };
export type DayEvent = { start: number; end: number; activity: string };
export type DayAnalysis = {
    /** その日の起床の時刻。起床の行が無ければ 0。/plan の柱の中で期日の位置を決めるのに使う。 */
    wake: number;
    /** その日の起床より後の最後の消灯の終わり。無ければ 24時。 */
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

/** 終了の 2359 は24時として数える（2400 は書けないので、日の終わりまでの予定は 2359 で書かれる）。 */
function endToMinutes(hhmm: string): number {
    const m = hhmmToMinutes(hhmm);
    return m === DAY_MINUTES - 1 ? DAY_MINUTES : m;
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
        blocks.push({ start: hhmmToMinutes(m[1]), end: m[3] ? endToMinutes(m[3]) : null, activity });
    }
    return blocks;
}

type ParsedDay = {
    /** 起床の行（時刻順）。読み込んでいない日で1つも無ければ、既定の 0700 起床で補う。 */
    wakeBlocks: Block[];
    events: DayEvent[];
    /** 消灯の予定。読み込んでいない日で1つも無ければ、既定の 2200-2300 消灯で補う。 */
    lightsOuts: { start: number; end: number }[];
};

function parseDay(content: string, loaded: boolean): ParsedDay {
    const blocks = parseBlocks(content);
    const wakeBlocks = blocks.filter((b) => b.activity.includes('起床')).sort((a, b) => a.start - b.start);
    // 時刻範囲を持つ予定だけを数える。終了の無い行・終了が開始より前の行は保存前に弾かれるが、
    // 規則を入れる前に保存された古い行が残っていても数えない。
    const events: DayEvent[] = blocks
        .filter((b): b is Block & { end: number } => !wakeBlocks.includes(b) && b.end !== null && b.end > b.start)
        .map((b) => ({ start: b.start, end: b.end, activity: b.activity }))
        .sort((a, b) => a.start - b.start);
    const lightsOuts = events.filter((e) => e.activity.includes('消灯')).map((e) => ({ start: e.start, end: e.end }));
    if (!loaded) {
        if (wakeBlocks.length === 0) wakeBlocks.push({ start: DEFAULT_WAKE_MINUTES, end: null, activity: '起床' });
        if (lightsOuts.length === 0) lightsOuts.push({ ...DEFAULT_LIGHTS_OUT });
    }
    return { wakeBlocks, events, lightsOuts };
}

export type DayInput = {
    /** YYYY-MM-DD */
    date: string;
    content: string;
    /** スケジュール画面で読み込んだ（既定予定を書き込んだ記録がある）日か。 */
    loaded: boolean;
};

/**
 * 複数日をひと続きの時間として解析する。睡眠は日をまたぐので、隣の日の起床・消灯も見る。
 * 渡した範囲の最初の境目より前は、最初が起床なら睡眠、消灯なら起きているとみなす。範囲の最初の日を
 * 正しく数えたいときは、前の日も含めて渡す。
 */
export function analyzeDays(days: DayInput[]): Map<string, DayAnalysis> {
    const result = new Map<string, DayAnalysis>();
    if (days.length === 0) return result;
    const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const first = sorted[0].date;
    const parsed = sorted.map((d) => ({
        date: d.date,
        offset: daysBetween(first, d.date) * DAY_MINUTES,
        ...parseDay(d.content, d.loaded),
    }));
    const total = parsed[parsed.length - 1].offset + DAY_MINUTES;

    // 起床と、消灯の予定の終わり（眠りに入る時刻）を時刻順に並べ、消灯の終わりから次の起床までを睡眠に
    // する。起きている間の起床・眠っている間の消灯（続いたときの2つ目以降）は無視する。消灯の時間の途中に
    // ある起床は、眠りに入る前なので無視される。同じ時刻なら消灯を先に置く（0300 に消灯が終わり 0300 に
    // 起床なら起きている）。
    type Edge = { at: number; kind: 'wake' | 'sleep' };
    const edges: Edge[] = [];
    for (const p of parsed) {
        for (const w of p.wakeBlocks) edges.push({ at: p.offset + w.start, kind: 'wake' });
        for (const l of p.lightsOuts) edges.push({ at: p.offset + l.end, kind: 'sleep' });
    }
    edges.sort((a, b) => a.at - b.at || (a.kind === 'sleep' ? -1 : 1) - (b.kind === 'sleep' ? -1 : 1));

    const slots: SlotKind[] = new Array(total).fill('free');
    let asleep = edges.length > 0 && edges[0].kind === 'wake';
    let sleepFrom = 0;
    for (const e of edges) {
        if (asleep && e.kind === 'wake') {
            slots.fill('sleep', sleepFrom, e.at);
            asleep = false;
        } else if (!asleep && e.kind === 'sleep') {
            sleepFrom = Math.min(e.at, total);
            asleep = true;
        }
    }
    if (asleep) slots.fill('sleep', sleepFrom, total);

    // 起きている間の予定（消灯の予定を含む）と身支度を非自由にする。
    // 読み込んでいない日に補った既定の消灯は events に無いので足す（置いた時間には数えない）。
    const busyByDay = parsed.map((p) =>
        [...p.events, ...p.lightsOuts].map((e) => ({ start: p.offset + e.start, end: p.offset + e.end })),
    );
    const routines: { start: number; end: number }[] = [];
    parsed.forEach((p, i) => {
        // 身支度は最大2時間なので、ぶつかる予定はその日か翌日にしか無い。
        const nearby = [...busyByDay[i], ...(busyByDay[i + 1] ?? [])];
        for (const w of p.wakeBlocks) {
            const wake = p.offset + w.start;
            // 起床の行が範囲（0700-1200 起床 …）なら、その範囲が身支度。時刻だけなら起床から最初の予定まで
            // （最大2時間）を身支度とし、起床の時点で続いている予定があれば0。
            // 0700-0700 のような同時刻の範囲は身支度0分（時刻だけの行とは区別する）。
            if (w.end !== null && w.end >= w.start) {
                routines.push({ start: wake, end: p.offset + w.end });
            } else {
                const firstStart = nearby
                    .filter((e) => e.end > wake)
                    .reduce((min, e) => Math.min(min, Math.max(e.start, wake)), wake + MORNING_MAX_MINUTES);
                routines.push({ start: wake, end: firstStart });
            }
        }
    });
    for (const b of [...busyByDay.flat(), ...routines]) {
        for (let m = Math.max(b.start, 0); m < Math.min(b.end, total); m++) if (slots[m] !== 'sleep') slots[m] = 'busy';
    }
    // 「睡眠」と書いた予定（昼寝など）は睡眠として塗る。起床・消灯の境目は動かさない。
    for (const p of parsed) {
        for (const e of p.events) {
            if (activityMatchesName(e.activity, '睡眠')) slots.fill('sleep', p.offset + e.start, p.offset + e.end);
        }
    }

    for (const p of parsed) {
        const runs: Run[] = [];
        for (let m = 0; m < DAY_MINUTES; m++) {
            const kind = slots[p.offset + m];
            const last = runs[runs.length - 1];
            if (last && last.kind === kind) last.end = m + 1;
            else runs.push({ kind, start: m, end: m + 1 });
        }
        const wake = p.wakeBlocks.length > 0 ? p.wakeBlocks[0].start : 0;
        const sleep = p.lightsOuts.filter((l) => l.start > wake).reduce((max, l) => Math.max(max, l.end), -1);
        result.set(p.date, {
            wake,
            sleep: sleep < 0 ? DAY_MINUTES : sleep,
            events: p.events,
            runs,
            freeMinutes: runs.filter((r) => r.kind === 'free').reduce((sum, r) => sum + r.end - r.start, 0),
        });
    }
    return result;
}

/**
 * 1日だけを解析する。前後の日を見ないので、最初の境目より前は analyzeDays と同じ推定になる。
 * loaded の既定は false（起床・消灯の行が無ければ既定で補う）。
 */
export function analyzeDayContent(content: string, loaded = false): DayAnalysis {
    return analyzeDays([{ date: '2000-01-01', content, loaded }]).get('2000-01-01')!;
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
