/**
 * /plan の累積グラフ（CapacityChart）の配置計算。描画はコンポーネント、数はここ。
 * 「今日から積み上げた使える空き」の階段と、締切の早い順に積んだ「残り必要時間」の線を、
 * すべて %（横は日の index、縦は時間）で置く。線が階段より下にあれば間に合う。
 */
import type { GoalStatus } from '@/src/lib/schedules/free-time';

const DAY_MINUTES = 24 * 60;

export type CapacityDay = {
    date: string;
    /** その日の自由時間（今日は今以降）。 */
    usableMinutes: number;
};

/** 累計の始まり（c0）と終わり（c1）を持つ1日の柱。 */
export type CapacityColumn = CapacityDay & { c0: number; c1: number };

/** 締切の点。位置は % で、線は前の点（fromX, fromY）から階段状に引く。 */
export type CapacityMark = {
    status: GoalStatus;
    mx: number;
    my: number;
    fromX: number;
    fromY: number;
};

export type CapacityLayout = {
    cols: CapacityColumn[];
    /** 縦軸の目盛の刻み（時間）。 */
    step: number;
    /** 縦軸の上端（時間）。step の倍数で、最低 step。 */
    yMax: number;
    /** 目盛の位置（時間）。step, 2*step, ..., yMax。 */
    ticks: number[];
    /** 期日が今より後で、グラフの範囲に入る目標だけ（締切の早い順）。 */
    upcoming: GoalStatus[];
    marks: CapacityMark[];
    /** 分 → 縦位置（%）。 */
    y: (minutes: number) => number;
    /** 日の index（小数なら日の中の位置）→ 横位置（%）。 */
    x: (index: number) => number;
    /** 1日の柱の幅（%）。 */
    columnWidthPercent: number;
};

/** 縦軸の刻み。上端が大きいほど粗くする。 */
export function niceStep(maxHours: number): number {
    if (maxHours <= 60) return 10;
    if (maxHours <= 150) return 25;
    if (maxHours <= 300) return 50;
    return 100;
}

/** "2026-10-05" → "10/5"。 */
export function shortDate(date: string): string {
    const [, m, d] = date.split('-').map(Number);
    return `${m}/${d}`;
}

export function isMonday(date: string): boolean {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 1;
}

/** 日ごとの使える空きを今日から積み上げる。 */
export function cumulativeColumns(days: CapacityDay[]): CapacityColumn[] {
    const cols: CapacityColumn[] = [];
    for (const d of days) {
        const c0 = cols.length > 0 ? cols[cols.length - 1].c1 : 0;
        cols.push({ ...d, c0, c1: c0 + d.usableMinutes });
    }
    return cols;
}

/**
 * 期日の時刻を、その日の柱の中の位置（0..1）にする。時計の時刻のまま置く（0時が左端、24時が右端。時刻の無い
 * 期日はその日の終わりで 1）。柱は1日分の自由時間をまとめて描くので、位置は締切の時刻を示すだけで、その時点
 * までの自由時間の量は表さない（間に合うかは evaluateGoals が判定する）。起床〜消灯の間の比で置いていた頃は、
 * 前日から起きたままの 0900 起床の日に 08:00 の締切が左端に寄った（本人選択 2026-10-18、
 * docs/free-time-model.md カード6）。
 */
export function positionWithinDay(dueMinutes: number | null): number {
    return Math.max(0, Math.min(1, (dueMinutes ?? DAY_MINUTES) / DAY_MINUTES));
}

/** 日が無ければ null（描かない）。 */
export function layoutCapacityChart(days: CapacityDay[], statuses: GoalStatus[]): CapacityLayout | null {
    const n = days.length;
    if (n === 0) return null;
    const cols = cumulativeColumns(days);
    const cum = cols[cols.length - 1].c1;
    const upcoming = statuses.filter((s) => !s.past && days.some((d) => d.date === s.goal.dueOn));
    const maxDemand = upcoming.reduce((m, s) => Math.max(m, s.cumulativeMinutes), 0);
    const topHours = Math.max(cum, maxDemand) / 60;
    const step = niceStep(topHours);
    const yMax = Math.max(step, Math.ceil(topHours / step) * step);
    const y = (minutes: number) => (minutes / 60 / yMax) * 100;
    const x = (index: number) => (index / n) * 100;
    const ticks: number[] = [];
    for (let v = step; v <= yMax; v += step) ticks.push(v);

    // 必要時間の線は前の締切の点から次の締切の点へ階段状に引く。最初の点は原点から。
    const marks: CapacityMark[] = [];
    upcoming.forEach((status) => {
        const i = days.findIndex((d) => d.date === status.goal.dueOn);
        const within = positionWithinDay(status.goal.dueMinutes);
        const prev = marks[marks.length - 1];
        marks.push({
            status,
            mx: x(i + within),
            my: y(status.cumulativeMinutes),
            fromX: prev ? prev.mx : 0,
            fromY: prev ? prev.my : 0,
        });
    });

    return { cols, step, yMax, ticks, upcoming, marks, y, x, columnWidthPercent: 100 / n };
}

/** ラベル1つ。anchor は締切の線の横位置（px）、width は描いた幅（px）。 */
export type LabelBox = { anchor: number; width: number };
export type LabelPlacement = { left: number[]; row: number[]; rows: number };

/**
 * 締切のラベルを、重ならない段に振り分ける。ラベルは右端を締切の線に揃え、
 * はみ出すなら [minLeft, maxRight] に押し戻す。左から順に、置ける一番下の段（0 が線に最も近い）へ置く。
 * 段の数は必要なだけ増える（固定の2段交互では、締切が近い日に3つ以上あると重なった）。
 */
export function placeLabels(labels: LabelBox[], minLeft: number, maxRight: number, gap: number): LabelPlacement {
    const left = labels.map(({ anchor, width }) => Math.max(minLeft, Math.min(anchor, maxRight) - width));
    const row = labels.map(() => 0);
    const rowEnds: number[] = [];
    const order = labels.map((_, i) => i).sort((a, b) => left[a] - left[b] || a - b);
    for (const i of order) {
        let r = rowEnds.findIndex((end) => end + gap <= left[i]);
        if (r === -1) r = rowEnds.push(0) - 1;
        row[i] = r;
        rowEnds[r] = left[i] + labels[i].width;
    }
    return { left, row, rows: rowEnds.length };
}
