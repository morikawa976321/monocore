import { TIME_LINE_REGEX, isValidHhmm } from './text-format';

/**
 * 予定テキストから「空き時間（自由時間）」を求める。スケジュール画面の日カードと /plan の両方が使う。
 *
 * スケジュール画面の予定を正として導出する（本人指定 2026-10-18。規則の由来は docs/decisions.md の /plan）。
 * 時間は日をまたいで連続しており、睡眠・非自由・自由の3つに分かれる。定義は docs/free-time-model.md §2 が正で、
 * この関数群はその段（行の解析 → 分類と既定の補完 → 睡眠の核と身支度 → 塗る → 日ごとに切る）にそのまま
 * 対応する。規則を変えるときは定義を先に直し、free-time.property.test.ts の参照実装も合わせる。
 * - 睡眠: 「その時刻以前の最後の印が入眠（消灯の予定の終わり）なら眠っている」。起床が続いたり消灯が
 *   続いたりしても2つ目以降は状態を変えない。「睡眠」を語として含む予定の時間も睡眠として塗る
 * - 非自由: 起きている間の予定の時間（消灯の予定を含む）と、起床から最初の予定までの身支度（最大2時間。
 *   起床の行が範囲を持てばその範囲）
 * - 自由: それ以外の起きている時間
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

/** 半開区間 [start, end)。分単位。 */
type Span = { start: number; end: number };
type Block = { start: number; end: number | null; activity: string };

// ---------- 1. 行の解析 ----------

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

// ---------- 2. 分類と既定の補完 ----------

/**
 * 範囲の扱いはこの2つだけで決める。0分（2200-2200）は「範囲がある」が「長さは無い」。
 * 起床の範囲と消灯は0分でも境目として働き、予定は長さのあるものだけを数える。逆順の行はどちらでもない
 * （保存前に弾かれるが、打鍵中の内容は解析されるし、規則を入れる前に保存された行も残っている）。
 */
function hasRange(b: Block): b is Block & { end: number } {
    return b.end !== null && b.end >= b.start;
}
function hasLength(b: Block): b is Block & { end: number } {
    return b.end !== null && b.end > b.start;
}

type ClassifiedDay = {
    /** 起床の行（時刻順）。rangeEnd は範囲を持つ起床の行の終わり（身支度の終わり）。 */
    wakes: { at: number; rangeEnd: number | null }[];
    /** 起床の行を除く、長さのある予定（消灯の予定を含む）。 */
    events: DayEvent[];
    /** 消灯の予定（0分を含む）。終わりが入眠の印。 */
    lightsOuts: Span[];
};

/**
 * その日の行を分類し、読み込んでいない日（既定予定を書き込んだ記録の無い日）に限って、起床の行が無ければ
 * 既定の 0700 起床を、消灯の行が無ければ既定の 2200-2300 消灯を補う。読み込んだ日は既定予定が実データと
 * して入っているので、行が無ければ本人が消したものとして補わない。補った消灯は events に入れない（置いた
 * 時間に数えない）。1つの行が起床と消灯の両方を含めば、両方として働く。
 */
function classifyDay(content: string, loaded: boolean): ClassifiedDay {
    const blocks = parseBlocks(content);
    const isWake = (b: Block) => b.activity.includes('起床');
    const wakes = blocks
        .filter(isWake)
        .map((b) => ({ at: b.start, rangeEnd: hasRange(b) ? b.end : null }))
        .sort((a, b) => a.at - b.at);
    const events: DayEvent[] = blocks
        .filter((b) => !isWake(b))
        .filter(hasLength)
        .map((b) => ({ start: b.start, end: b.end, activity: b.activity }))
        .sort((a, b) => a.start - b.start);
    const lightsOuts: Span[] = blocks
        .filter((b) => b.activity.includes('消灯'))
        .filter(hasRange)
        .map((b) => ({ start: b.start, end: b.end }));
    if (!loaded) {
        if (wakes.length === 0) wakes.push({ at: DEFAULT_WAKE_MINUTES, rangeEnd: null });
        if (lightsOuts.length === 0) lightsOuts.push({ ...DEFAULT_LIGHTS_OUT });
    }
    return { wakes, events, lightsOuts };
}

// ---------- 3. 睡眠の核と身支度（全日を通した分） ----------

/**
 * 「その時刻以前の最後の印が入眠なら眠っている」を区間にする。同時刻は起床が勝つ（03:00 に消灯が終わり
 * 03:00 に起床なら起きている）ので、同時刻は入眠を先に並べる。続いた起床・続いた入眠は状態を変えない。
 * 範囲の手前は分からないので、最初の印が起床なら眠った状態で、そうでなければ起きた状態で始める。
 */
function sleepCore(wakeAts: number[], sleepAts: number[], total: number): Span[] {
    const marks = [...sleepAts.map((at) => ({ at, asleep: true })), ...wakeAts.map((at) => ({ at, asleep: false }))].sort(
        (a, b) => a.at - b.at || Number(b.asleep) - Number(a.asleep),
    );
    const spans: Span[] = [];
    let asleep = marks.length > 0 && !marks[0].asleep;
    let from = 0;
    for (const m of marks) {
        if (m.asleep === asleep) continue;
        if (asleep) spans.push({ start: from, end: m.at });
        else from = m.at;
        asleep = m.asleep;
    }
    if (asleep) spans.push({ start: from, end: total });
    return spans;
}

/**
 * 起床の行ごとの身支度。範囲を持てばその範囲（0700-0700 は0分）。時刻だけなら起床から最初の予定まで
 * （最大2時間）で、起床の時点で続いている予定があれば0分。最初の予定は、長さのある予定と0分を含む消灯の
 * 記録から探す（区間をつないでから探すと0分の消灯が消えて結果が変わる）。境目として働かなかった起床
 * （起きている間の起床）にも付ける。
 */
function routineSpan(at: number, rangeEnd: number | null, caps: Span[]): Span {
    if (rangeEnd !== null) return { start: at, end: rangeEnd };
    const end = caps.filter((c) => c.end > at).reduce((min, c) => Math.min(min, Math.max(c.start, at)), at + MORNING_MAX_MINUTES);
    return { start: at, end };
}

// ---------- 4〜5. 塗る・日ごとに切る ----------

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
        ...classifyDay(d.content, d.loaded),
    }));
    const total = parsed[parsed.length - 1].offset + DAY_MINUTES;
    const shift = (offset: number, s: Span): Span => ({ start: offset + s.start, end: offset + s.end });

    const core = sleepCore(
        parsed.flatMap((p) => p.wakes.map((w) => p.offset + w.at)),
        parsed.flatMap((p) => p.lightsOuts.map((l) => p.offset + l.end)),
        total,
    );
    // 予定と消灯の予定（補った既定の消灯を含む）。身支度を打ち切る「最初の予定」もここから探す。
    const busyByDay = parsed.map((p) => [...p.events, ...p.lightsOuts].map((s) => shift(p.offset, s)));
    const routines = parsed.flatMap((p, i) => {
        // 身支度は最大2時間なので、ぶつかる予定はその日か翌日にしか無い。
        const caps = [...busyByDay[i], ...(busyByDay[i + 1] ?? [])];
        return p.wakes.map((w) => routineSpan(p.offset + w.at, w.rangeEnd === null ? null : p.offset + w.rangeEnd, caps));
    });
    const sleepEvents = parsed.flatMap((p) =>
        p.events.filter((e) => activityMatchesName(e.activity, '睡眠')).map((e) => shift(p.offset, e)),
    );

    // 塗る順が優先順位: 非自由を塗り、その上を睡眠（眠っている間の予定と身支度は睡眠）と「睡眠」の予定で塗る。
    const slots: SlotKind[] = new Array(total).fill('free');
    for (const s of [...busyByDay.flat(), ...routines]) slots.fill('busy', s.start, s.end);
    for (const s of [...core, ...sleepEvents]) slots.fill('sleep', s.start, s.end);

    for (const p of parsed) {
        const runs: Run[] = [];
        for (let m = 0; m < DAY_MINUTES; m++) {
            const kind = slots[p.offset + m];
            const last = runs[runs.length - 1];
            if (last && last.kind === kind) last.end = m + 1;
            else runs.push({ kind, start: m, end: m + 1 });
        }
        const wake = p.wakes.length > 0 ? p.wakes[0].at : 0;
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

/**
 * 予定の無い日（0700 起床・2200-2300 消灯だけの日）。読み込んでいない日の代わりに「× 日数」で使う。
 * 0時に眠っている未読込の空の日で、未読込の空の日が続くときの2日目以降と同じ値になる（前の日が起きたまま
 * 終わる1日目とは食い違う。free-time.property.test.ts の P13）。
 */
export const EMPTY_DAY = analyzeDays([
    { date: '2000-01-01', content: '', loaded: false },
    { date: '2000-01-02', content: '', loaded: false },
]).get('2000-01-02')!;

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
