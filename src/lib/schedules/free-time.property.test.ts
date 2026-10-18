import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { addDays, analyzeDays, evaluateGoals, freeMinutesBetween, type DayAnalysis, type SlotKind } from './free-time';

/**
 * 睡眠・非自由・自由の数え方を、ランダムに作った予定で確かめる。定義と性質の一覧は docs/free-time-model.md。
 * 生成器は予定テキストではなく行の構造（開始・終了・説明）を作り、本体にはテキストに直して渡す。参照実装は
 * 構造から直接分類するので、本体のテキストの解釈とは独立している（複数行の説明などテキスト固有の解釈は
 * free-time.test.ts の例で確かめる）。
 */

const DAY = 1440;
const FIRST_DATE = '2026-10-15';

type GenLine = { start: number; end: number | null; label: string };
type GenDay = { loaded: boolean; lines: GenLine[] };

const MARK_LABELS = ['起床', '消灯', '起床 発送', 'BM 読書 消灯'];
const SLEEP_LABELS = ['睡眠', '昼 睡眠'];
const PLAIN_LABELS = ['作業', 'BCL'];
// 語の一部に起床・消灯・睡眠を含む予定。
const CONFUSING_LABELS = ['睡眠薬を買う', '消灯前の片付け', '起床時刻の見直し', '起床 消灯'];
const ALL_LABELS = [...MARK_LABELS, ...SLEEP_LABELS, ...PLAIN_LABELS, ...CONFUSING_LABELS];

// 30分刻みを主に、端の値（0000・2359・既定の 0700・2200・2300）と任意の分を混ぜる。
const minuteArb = fc.oneof(
    { weight: 7, arbitrary: fc.integer({ min: 0, max: 47 }).map((i) => i * 30) },
    { weight: 1, arbitrary: fc.constantFrom(0, 1439, 420, 1320, 1380) },
    { weight: 2, arbitrary: fc.integer({ min: 0, max: DAY - 1 }) },
);

// 終了は 無し・同時刻・2359・逆順・正の長さ（30分単位で最大6時間）。逆順は保存前に弾かれるが、打鍵中は解析される。
function lineArb(labels: string[]): fc.Arbitrary<GenLine> {
    const endKind = fc.oneof(
        fc.constant('none' as const),
        fc.constant('same' as const),
        fc.constant('2359' as const),
        fc.constant('reversed' as const),
        fc.integer({ min: 1, max: 12 }),
    );
    return fc.record({ start: minuteArb, endKind, label: fc.constantFrom(...labels) }).map(({ start, endKind, label }) => {
        let end: number | null;
        if (endKind === 'none') end = null;
        else if (endKind === 'same') end = start;
        else if (endKind === '2359') end = DAY - 1;
        else if (endKind === 'reversed') end = Math.max(0, start - 30);
        else end = Math.min(DAY - 1, start + endKind * 30);
        return { start, end, label };
    });
}

const dayArb: fc.Arbitrary<GenDay> = fc.record({
    loaded: fc.oneof({ weight: 7, arbitrary: fc.constant(true) }, { weight: 3, arbitrary: fc.constant(false) }),
    lines: fc.array(lineArb(ALL_LABELS), { maxLength: 6 }),
});
const daysArb = fc.array(dayArb, { minLength: 1, maxLength: 5 });

function hhmm(minutes: number): string {
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}${String(minutes % 60).padStart(2, '0')}`;
}

function render(day: GenDay): string {
    return day.lines.map((l) => `${hhmm(l.start)}${l.end === null ? '' : `-${hhmm(l.end)}`} ${l.label}`).join('\n');
}

function toInputs(days: GenDay[], from = FIRST_DATE) {
    return days.map((d, i) => ({ date: addDays(from, i), content: render(d), loaded: d.loaded }));
}

/** 解析結果を、渡した日の順に分ごとの種類へ広げる。 */
function minuteKinds(analyses: Map<string, DayAnalysis>, dates: string[]): SlotKind[] {
    const kinds: SlotKind[] = [];
    for (const date of dates) for (const r of analyses.get(date)!.runs) for (let m = r.start; m < r.end; m++) kinds.push(r.kind);
    return kinds;
}

function analyzeKinds(days: GenDay[]): SlotKind[] {
    const inputs = toInputs(days);
    return minuteKinds(analyzeDays(inputs), inputs.map((d) => d.date));
}

// ---------- 参照実装（docs/free-time-model.md §2 を分ごとにそのまま判定する） ----------

/** 「含む」の判定。起床・消灯は部分一致、睡眠は語として（前後が行端か空白）。 */
function containsMark(label: string, word: string): boolean {
    return label.includes(word);
}
function containsWord(label: string, word: string): boolean {
    return new RegExp(`(^|\\s)${word}(\\s|$)`).test(label);
}

type Span = { a: number; b: number };
type Classified = {
    wakes: { at: number; rangeEnd: number | null }[];
    events: (Span & { label: string })[];
    lightsOuts: Span[];
};

/** 行の分類と、未読込の日の既定の補完（§2.2・§2.3）。時刻は日の0時からの分。 */
function classifyDay(day: GenDay, offset = 0): Classified {
    const c: Classified = { wakes: [], events: [], lightsOuts: [] };
    for (const l of day.lines) {
        // 終了の 2359 は24時。
        const end = l.end === null ? null : l.end === DAY - 1 ? DAY : l.end;
        const ranged = end !== null && end >= l.start;
        const isWake = containsMark(l.label, '起床');
        if (isWake) c.wakes.push({ at: offset + l.start, rangeEnd: ranged ? offset + end! : null });
        else if (end !== null && end > l.start) c.events.push({ a: offset + l.start, b: offset + end, label: l.label });
        if (containsMark(l.label, '消灯') && ranged) c.lightsOuts.push({ a: offset + l.start, b: offset + end! });
    }
    if (!day.loaded) {
        if (c.wakes.length === 0) c.wakes.push({ at: offset + 420, rangeEnd: null });
        if (c.lightsOuts.length === 0) c.lightsOuts.push({ a: offset + 1320, b: offset + 1380 });
    }
    return c;
}

function hasMark(day: GenDay): boolean {
    const c = classifyDay(day);
    return c.wakes.length > 0 || c.lightsOuts.length > 0;
}

/** 時刻だけの起床（既定の起床を含む）の時刻。日の0時からの分。 */
function timeOnlyWakes(day: GenDay): number[] {
    return classifyDay(day).wakes.filter((w) => w.rangeEnd === null).map((w) => w.at);
}

function oracleKinds(days: GenDay[]): SlotKind[] {
    const all = days.map((d, i) => classifyDay(d, i * DAY));
    const wakes = all.flatMap((c) => c.wakes);
    const events = all.flatMap((c) => c.events);
    const lightsOuts = all.flatMap((c) => c.lightsOuts);
    const W = wakes.map((w) => w.at);
    const S = lightsOuts.map((l) => l.b);
    // 窓の手前: 最初の印が起床なら、窓より前に入眠の印があったとみなす（同時刻は入眠が先）。
    const priorAsleep = Math.min(Infinity, ...W) < Math.min(Infinity, ...S);
    const Sx = priorAsleep ? [-1, ...S] : S;
    const Wx = priorAsleep ? W : [-1, ...W];
    const latest = (xs: number[], t: number) => xs.reduce((m, x) => (x <= t && x > m ? x : m), -Infinity);
    // 身支度: 範囲があればその範囲。時刻だけなら最初の予定（0分を含まない予定・0分を含む消灯の記録）まで、最大2時間。
    const caps = [...events, ...lightsOuts];
    const routines: Span[] = wakes.map((w) => {
        if (w.rangeEnd !== null) return { a: w.at, b: w.rangeEnd };
        let cap = w.at + 120;
        for (const x of caps) if (x.b > w.at) cap = Math.min(cap, Math.max(x.a, w.at));
        return { a: w.at, b: cap };
    });
    const sleepEvents = events.filter((e) => containsWord(e.label, '睡眠'));
    const inside = (xs: Span[], t: number) => xs.some((x) => x.a <= t && t < x.b);
    const kinds: SlotKind[] = [];
    for (let t = 0; t < days.length * DAY; t++) {
        const asleep = latest(Sx, t) > latest(Wx, t);
        if (asleep || inside(sleepEvents, t)) kinds.push('sleep');
        else if (inside(events, t) || inside(lightsOuts, t) || inside(routines, t)) kinds.push('busy');
        else kinds.push('free');
    }
    return kinds;
}

// ---------- 性質 ----------

const RUNS = { numRuns: 300 };

describe('analyzeDays の性質', () => {
    it('P1 各日の runs が 0〜24時を隙間・重なり無く覆い、隣り合う run は種類が違う', () => {
        fc.assert(
            fc.property(daysArb, (days) => {
                for (const a of analyzeDays(toInputs(days)).values()) {
                    let at = 0;
                    a.runs.forEach((r, i) => {
                        expect(r.start).toBe(at);
                        expect(r.end).toBeGreaterThan(r.start);
                        if (i > 0) expect(r.kind).not.toBe(a.runs[i - 1].kind);
                        at = r.end;
                    });
                    expect(at).toBe(DAY);
                }
            }),
            RUNS,
        );
    });

    it('P2 freeMinutes は自由の run の和で、freeMinutesBetween は区間を分けても和が変わらない', () => {
        const cut = fc.integer({ min: 0, max: DAY });
        fc.assert(
            fc.property(daysArb, cut, cut, cut, (days, x, y, z) => {
                const [a, b, c] = [x, y, z].sort((p, q) => p - q);
                for (const d of analyzeDays(toInputs(days)).values()) {
                    const free = d.runs.filter((r) => r.kind === 'free').reduce((s, r) => s + r.end - r.start, 0);
                    expect(d.freeMinutes).toBe(free);
                    expect(freeMinutesBetween(d, 0, DAY)).toBe(d.freeMinutes);
                    expect(freeMinutesBetween(d, a, c)).toBe(freeMinutesBetween(d, a, b) + freeMinutesBetween(d, b, c));
                }
            }),
            RUNS,
        );
    });

    it('P3 参照実装（定義を分ごとに判定したもの）と全分一致する', () => {
        fc.assert(
            fc.property(daysArb, (days) => {
                expect(analyzeKinds(days)).toEqual(oracleKinds(days));
            }),
            { numRuns: 500 },
        );
    });

    it('P4 1日の中の行の順番に依存しない', () => {
        const withShuffled = daysArb.chain((days) =>
            fc.tuple(
                fc.constant(days),
                fc.tuple(...days.map((d) => fc.shuffledSubarray(d.lines, { minLength: d.lines.length, maxLength: d.lines.length }))),
            ),
        );
        fc.assert(
            fc.property(withShuffled, ([days, shuffled]) => {
                expect(analyzeKinds(shuffled.map((lines, i) => ({ ...days[i], lines })))).toEqual(analyzeKinds(days));
            }),
            RUNS,
        );
    });

    it('P5 日を渡す順番と、全日付を同じ日数ずらすことに依存しない', () => {
        fc.assert(
            fc.property(daysArb, fc.integer({ min: -400, max: 400 }), (days, shift) => {
                const inputs = toInputs(days);
                const base = analyzeDays(inputs);
                const reversed = analyzeDays([...inputs].reverse());
                const shifted = analyzeDays(toInputs(days, addDays(FIRST_DATE, shift)));
                inputs.forEach((d, i) => {
                    expect(reversed.get(d.date)).toEqual(base.get(d.date));
                    expect(shifted.get(addDays(addDays(FIRST_DATE, shift), i))).toEqual(base.get(d.date));
                });
            }),
            RUNS,
        );
    });

    it('P6 後ろに日を足しても、それまでの日は変わらない（元の範囲に境目の印が1つでもあるとき）', () => {
        fc.assert(
            fc.property(daysArb, fc.array(dayArb, { minLength: 1, maxLength: 3 }), (head, tail) => {
                fc.pre(head.some(hasMark));
                const n = head.length * DAY;
                expect(analyzeKinds([...head, ...tail]).slice(0, n)).toEqual(analyzeKinds(head));
            }),
            RUNS,
        );
    });

    it('P7 前に日を足しても、境目の印がある最初の日より後の日は変わらない', () => {
        fc.assert(
            fc.property(fc.array(dayArb, { minLength: 1, maxLength: 3 }), daysArb, (prefix, days) => {
                const firstMarked = days.findIndex(hasMark);
                fc.pre(firstMarked >= 0);
                const from = (firstMarked + 1) * DAY;
                expect(analyzeKinds([...prefix, ...days]).slice(prefix.length * DAY + from)).toEqual(analyzeKinds(days).slice(from));
            }),
            RUNS,
        );
    });

    it('P8 未読込の日は、既定の 0700 起床・2200-2300 消灯を書き足した読込済みの日と同じに数える', () => {
        fc.assert(
            fc.property(daysArb, (days) => {
                const filled = days.map((d) => {
                    if (d.loaded) return d;
                    const c = classifyDay({ ...d, loaded: true });
                    const lines = [...d.lines];
                    if (c.wakes.length === 0) lines.push({ start: 420, end: null, label: '起床' });
                    if (c.lightsOuts.length === 0) lines.push({ start: 1320, end: 1380, label: '消灯' });
                    return { loaded: true, lines };
                });
                expect(analyzeKinds(filled)).toEqual(analyzeKinds(days));
            }),
            RUNS,
        );
    });

    it('P9 同じ行を重ねても、普通の予定を隣り合う2つに割っても、帯は変わらない', () => {
        fc.assert(
            fc.property(daysArb, fc.nat(), fc.nat(), (days, i, j) => {
                const k = i % days.length;
                fc.pre(days[k].lines.length > 0);
                const dup = days.map((d, x) => (x === k ? { ...d, lines: [...d.lines, d.lines[j % d.lines.length]] } : d));
                expect(analyzeKinds(dup)).toEqual(analyzeKinds(days));
            }),
            RUNS,
        );
        const slot = fc.integer({ min: 1, max: 8 });
        fc.assert(
            fc.property(daysArb, fc.nat(), fc.integer({ min: 0, max: 47 }), slot, slot, (days, i, s, x, y) => {
                const k = i % days.length;
                const start = s * 30;
                const mid = Math.min(DAY - 1, start + x * 30);
                const end = Math.min(DAY - 1, mid + y * 30);
                fc.pre(start < mid && mid < end);
                const add = (lines: GenLine[]) => days.map((d, n) => (n === k ? { ...d, lines: [...d.lines, ...lines] } : d));
                const whole = add([{ start, end, label: '作業' }]);
                const split = add([
                    { start, end: mid, label: '作業' },
                    { start: mid, end, label: '作業' },
                ]);
                expect(analyzeKinds(split)).toEqual(analyzeKinds(whole));
            }),
            RUNS,
        );
    });

    it('P10 起床・消灯・睡眠でない予定を足しても、眠っている時間は変わらない', () => {
        fc.assert(
            fc.property(daysArb, fc.nat(), lineArb(PLAIN_LABELS), (days, i, extra) => {
                const k = i % days.length;
                const after = analyzeKinds(days.map((d, n) => (n === k ? { ...d, lines: [...d.lines, extra] } : d)));
                const before = analyzeKinds(days);
                expect(after.map((kind) => kind === 'sleep')).toEqual(before.map((kind) => kind === 'sleep'));
            }),
            RUNS,
        );
    });

    // 「予定を足すと自由時間は増えない」は成り立たない。身支度は最初の予定までなので、朝に短い予定を足すと
    // 予定の後が自由になる（本人の指定。docs/free-time-model.md カード1）。増えてよいのは、時刻だけの起床から
    // 2時間の中だけ。
    it('P11 予定を1件足して自由になる分は、時刻だけの起床から2時間の中にしか無い', () => {
        fc.assert(
            fc.property(daysArb, fc.nat(), lineArb(PLAIN_LABELS), (days, i, extra) => {
                const k = i % days.length;
                const before = analyzeKinds(days);
                const after = analyzeKinds(days.map((d, n) => (n === k ? { ...d, lines: [...d.lines, extra] } : d)));
                const allowed = new Set<number>();
                days.forEach((d, n) => {
                    for (const w of timeOnlyWakes(d)) for (let m = 0; m < 120; m++) allowed.add(n * DAY + w + m);
                });
                after.forEach((kind, m) => {
                    if (kind === 'free' && before[m] !== 'free') expect(allowed.has(m)).toBe(true);
                });
            }),
            RUNS,
        );
    });
});

describe('evaluateGoals の性質', () => {
    it('P12 締切を遅くすると、締切までの自由時間は減らない', () => {
        const due = fc.tuple(fc.integer({ min: 0, max: 6 }), fc.integer({ min: 0, max: DAY }));
        fc.assert(
            fc.property(daysArb, fc.integer({ min: 0, max: DAY }), due, due, (days, now, p, q) => {
                const [early, late] = [p, q].sort((u, v) => u[0] - v[0] || u[1] - v[1]);
                const analyses = analyzeDays(toInputs(days));
                const supply = ([d, t]: [number, number]) =>
                    evaluateGoals({
                        goals: [{ id: 'g', name: '', dueOn: addDays(FIRST_DATE, d), dueMinutes: t, needMinutes: 0 }],
                        days: analyses,
                        today: FIRST_DATE,
                        nowMinutes: now,
                    })[0];
                const a = supply(early);
                const b = supply(late);
                fc.pre(!a.past && !b.past);
                expect(a.supplyMinutes).toBeLessThanOrEqual(b.supplyMinutes);
            }),
            RUNS,
        );
    });

    // /plan は読み込んだ範囲の外の日を「予定の無い日の自由時間 × 日数」で数える（EMPTY_DAY）。それが、未読込の
    // 空の日を並べて解析したときと合うことの確認。合わないのは、直前の日が起きたまま終わったときの1日目だけ。
    it('P13 未読込の空の日が続くとき、2日目以降は予定の無い日と同じで、1日目は0時に眠っていれば同じ', () => {
        const empty = analyzeDays([{ date: '2000-01-01', content: '', loaded: false }]).get('2000-01-01')!.freeMinutes;
        fc.assert(
            fc.property(daysArb, fc.integer({ min: 1, max: 4 }), (days, extra) => {
                const all = analyzeDays(toInputs([...days, ...Array.from({ length: extra }, () => ({ loaded: false, lines: [] }))]));
                const tail = Array.from({ length: extra }, (_, i) => all.get(addDays(FIRST_DATE, days.length + i))!);
                for (const d of tail.slice(1)) expect(d.freeMinutes).toBe(empty);
                if (tail[0].runs[0].kind === 'sleep') expect(tail[0].freeMinutes).toBe(empty);
                else expect(tail[0].freeMinutes).toBeGreaterThan(empty);
            }),
            RUNS,
        );
    });
});
