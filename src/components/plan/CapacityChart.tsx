'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { GoalStatus } from '@/src/lib/schedules/free-time';
import {
    type CapacityDay,
    type LabelPlacement,
    isMonday,
    layoutCapacityChart,
    placeLabels,
    shortDate,
} from '@/src/lib/plan/capacity-chart';

/** 縦軸の目盛の文字が使う左の余白（ml-12）。ラベルはここまで左へはみ出してよい。 */
const AXIS_GUTTER_PX = 48;
/** ラベル1段の高さ（leading-4 の 16px と段の間の 4px）。 */
const LABEL_ROW_PX = 20;
/** グラフの上端と一番下の段の間（mb-1 相当）。 */
const LABEL_OFFSET_PX = 4;
/** 同じ段で隣り合うラベルの間に空ける幅。 */
const LABEL_GAP_PX = 8;
/** ラベルが無くても、最上段の目盛の文字（-top-2）が切れない上の余白。 */
const MIN_TOP_PX = 8;

/**
 * 今日から積み上げた「使える空き」の階段と、締切の早い順に積んだ「残り必要時間」の線。
 * 線が階段より下にあれば間に合う。横位置・高さはすべて % で置き、幅に追従させる。
 * 配置の計算は lib/plan/capacity-chart.ts。
 */
export function CapacityChart({ days, statuses }: { days: CapacityDay[]; statuses: GoalStatus[] }) {
    const layout = layoutCapacityChart(days, statuses);
    const marks = layout?.marks ?? [];
    const plotRef = useRef<HTMLDivElement>(null);
    const labelRefs = useRef<(HTMLSpanElement | null)[]>([]);
    const [placement, setPlacement] = useState<LabelPlacement | null>(null);

    // ラベルの幅は描いてみないと分からないので、描いた幅を測って段を決める（塗る前に決まるので揺れない）。
    // 幅が変わると線の位置（%）と px の関係が変わるので、グラフの幅の変化でも測り直す。
    const labelKey = marks.map((m) => `${m.status.goal.id}:${m.mx}:${labelText(m.status)}`).join('|');
    useLayoutEffect(() => {
        const plot = plotRef.current;
        if (!plot) return;
        const measure = () => {
            const width = plot.clientWidth;
            const boxes = marks.map((m, i) => ({
                anchor: (m.mx / 100) * width,
                width: labelRefs.current[i]?.offsetWidth ?? 0,
            }));
            setPlacement(placeLabels(boxes, -AXIS_GUTTER_PX, width, LABEL_GAP_PX));
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(plot);
        return () => ro.disconnect();
        // marks は描くたびに作り直されるので、中身の変化は labelKey で見る。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [labelKey]);

    if (!layout) return null;
    const { cols, ticks, y, x, columnWidthPercent } = layout;
    const rows = placement && placement.left.length === marks.length ? placement.rows : 0;
    const topPx = Math.max(MIN_TOP_PX, rows > 0 ? LABEL_OFFSET_PX + rows * LABEL_ROW_PX : 0);

    return (
        <div className="space-y-2">
            <div
                ref={plotRef}
                className="relative ml-12 mb-6 h-56 border-b border-neutral-400 dark:border-neutral-600"
                style={{ marginTop: topPx }}
            >
                {ticks.map((v) => (
                    <div key={v} className="absolute inset-x-0 h-px bg-neutral-200 dark:bg-neutral-800" style={{ bottom: `${y(v * 60)}%` }}>
                        <span className="absolute -left-12 -top-2 w-10 text-right text-sm leading-4 text-neutral-700 dark:text-neutral-300">{v}h</span>
                    </div>
                ))}
                {cols.map((c, i) => (
                    <div key={c.date} className="absolute inset-y-0" style={{ left: `${x(i)}%`, width: `${columnWidthPercent}%` }}>
                        <div
                            title={`${shortDate(c.date)} 自由時間 ${(c.usableMinutes / 60).toFixed(1)}h → 累計 ${(c.c1 / 60).toFixed(1)}h`}
                            className="absolute inset-x-px bottom-0 bg-neutral-200 dark:bg-neutral-800"
                            style={{ height: `${y(c.c0)}%` }}
                        />
                        <div
                            className={`absolute inset-x-px ${i === 0 ? 'bg-amber-500 dark:bg-amber-500' : 'bg-neutral-600 dark:bg-neutral-400'}`}
                            style={{ bottom: `${y(c.c0)}%`, height: `${Math.max(0.5, y(c.c1) - y(c.c0))}%` }}
                        />
                        {(i === 0 || isMonday(c.date)) && (
                            <span
                                className={`absolute left-0 top-full mt-1 whitespace-nowrap text-sm leading-4 ${i === 0 ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-700 dark:text-neutral-300'}`}
                            >
                                {shortDate(c.date)}
                            </span>
                        )}
                    </div>
                ))}
                {marks.map(({ status: s, mx, my, fromX, fromY }, i) => {
                    const placed = placement && placement.left.length === marks.length;
                    return (
                        <div key={s.goal.id}>
                            <div className="absolute bottom-0 top-0 border-l border-dashed border-amber-500/60 dark:border-amber-400/60" style={{ left: `${mx}%` }} />
                            <div className="absolute h-0.5 bg-amber-500 dark:bg-amber-500" style={{ left: `${fromX}%`, width: `${Math.max(0, mx - fromX)}%`, bottom: `${fromY}%` }} />
                            <div className="absolute w-0.5 bg-amber-500 dark:bg-amber-500" style={{ left: `${mx}%`, bottom: `${fromY}%`, height: `${Math.max(0, my - fromY)}%` }} />
                            <div
                                className={`absolute -ml-1 -mb-1 h-2 w-2 rounded-full ${s.ok ? 'bg-amber-500 dark:bg-amber-500' : 'border-2 border-amber-600 bg-neutral-50 dark:border-amber-400 dark:bg-neutral-900'}`}
                                style={{ left: `${mx}%`, bottom: `${my}%` }}
                                title={`${s.goal.name} 必要の累計 ${(s.cumulativeMinutes / 60).toFixed(1)}h / 締切までの空き ${(s.supplyMinutes / 60).toFixed(1)}h`}
                            />
                            <span
                                ref={(el) => {
                                    labelRefs.current[i] = el;
                                }}
                                title={labelText(s)}
                                className={`absolute max-w-48 truncate pr-1 text-sm leading-4 text-amber-600 dark:text-amber-400 ${s.ok ? '' : 'font-medium'} ${placed ? '' : 'invisible'}`}
                                style={
                                    placed
                                        ? {
                                              left: placement.left[i],
                                              bottom: `calc(100% + ${LABEL_OFFSET_PX + placement.row[i] * LABEL_ROW_PX}px)`,
                                          }
                                        : { left: 0, bottom: '100%' }
                                }
                            >
                                {labelText(s)}
                            </span>
                        </div>
                    );
                })}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-700 dark:text-neutral-300">
                <span className="inline-flex items-center gap-1">
                    <span className="inline-block h-2 w-4 rounded-sm bg-neutral-600 dark:bg-neutral-400" />
                    自由時間の累計
                </span>
                <span className="inline-flex items-center gap-1">
                    <span className="inline-block h-0.5 w-4 bg-amber-500 dark:bg-amber-500" />
                    必要時間の累計
                </span>
            </div>
        </div>
    );
}

function labelText(s: GoalStatus): string {
    return `${s.goal.name || '（名前なし）'}${s.ok ? '' : ' 不足'}`;
}
