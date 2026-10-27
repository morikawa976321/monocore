'use client';

import { useEffect } from 'react';
import { OverlayPanel } from '@/src/components/layout/OverlayPanel';
import { Button } from '@/src/components/ui/Button';
import { useSecondClock } from '@/src/hooks/useSecondClock';
import { getDefaultTimezone, utcToLocalTime } from '@/src/lib/date';
import { dateLabelToDateStr, type DayEntry } from '@/src/lib/schedules/text-format';
import { formatRemaining, timerStateAt, type TimerState } from '@/src/lib/schedules/timer';

// 今やっている予定の残りと、次の予定までの時間を出すタイマー(本人の要望 2026-10-27:
// 「今やっている作業の終了までの時間を可視化して怠けるのを防いだり、作業開始までの時間を可視化して時間になると
// 同時に始められるようにしたり」)。時間は手で設定せず、今日の予定のテキストから決まる(手動モードは本人が不要とした)。
// 出す場所はヘッダー(名前と残り時間・下線の残りのバー)・タブ名・タイマーのモーダルの3つ。

type Timer = { state: TimerState; now: number; timezone: string };

function useScheduleTimer(entries: DayEntry[]): Timer | null {
    const now = useSecondClock();
    if (now === null) return null;
    const timezone = getDefaultTimezone();
    // 日付は時計から取る(ページの todayStr は読み込み時点の日付で、0時をまたいでも変わらない)。
    const today = utcToLocalTime(new Date(now).toISOString(), timezone).date;
    const content = entries.find((e) => dateLabelToDateStr(e.dateLabel) === today)?.content ?? '';
    return { state: timerStateAt(today, content, timezone, now), now, timezone };
}

/** 測っている区間 [from, to) と、その残りの割合(1 → 0)。測る区間が無ければ null。 */
function span({ state, now }: Timer): { from: number; to: number; remaining: number } | null {
    const [from, to] =
        state.kind === 'active' ? [state.start, state.end] : state.next ? [state.next.since, state.next.start] : [0, 0];
    if (to <= from) return null;
    return { from, to, remaining: Math.min(1, Math.max(0, (to - now) / (to - from))) };
}

function clock(t: number, timezone: string): string {
    const { hhmm } = utcToLocalTime(new Date(t).toISOString(), timezone);
    return `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;
}

type ScheduleTimerChipProps = { entries: DayEntry[]; onOpen: () => void };

/** ヘッダーのタイトル横に出す名前と残り時間。押すとタイマーのモーダルを開く。タブ名もここで書き換える。 */
export function ScheduleTimerChip({ entries, onOpen }: ScheduleTimerChipProps) {
    const timer = useScheduleTimer(entries);
    const s = timer?.state;
    const remaining = s?.kind === 'active' ? s.end - timer!.now : s?.next ? s.next.start - timer!.now : null;
    const tabTitle =
        s?.kind === 'active'
            ? `${formatRemaining(remaining!)} ${s.activity}`
            : s?.next
              ? `${formatRemaining(remaining!)} ${s.next.activity}まで`
              : null;

    // 残り時間を先頭に置く(タブ幅が狭いと末尾から切れるため)。ページを離れたら元のタイトルに戻す。
    useEffect(() => {
        if (tabTitle === null) return;
        const original = document.title;
        document.title = `${tabTitle} · ${original}`;
        return () => {
            document.title = original;
        };
    }, [tabTitle]);

    if (!s) return null;
    return (
        <Button color="ghost" size="md" onClick={onOpen} aria-label="タイマーを開く" className="h-9 min-w-0 px-2 sm:text-base">
            {s.kind === 'active' ? (
                <span className="truncate text-neutral-900 dark:text-neutral-50">{s.activity}</span>
            ) : (
                <span className="shrink-0 font-normal">予定なし</span>
            )}
            {s.kind === 'active' && <span className="hidden shrink-0 font-normal sm:inline">残り</span>}
            {s.kind === 'idle' && s.next && (
                <span className="hidden truncate font-normal sm:inline">{s.next.activity}まで</span>
            )}
            {remaining !== null && (
                <span className="shrink-0 tabular-nums text-neutral-900 dark:text-neutral-50">{formatRemaining(remaining)}</span>
            )}
        </Button>
    );
}

/** ヘッダーの下線に重ねる残りのバー。左端から伸び、残りが減るほど短くなる。 */
export function ScheduleTimerBar({ entries }: { entries: DayEntry[] }) {
    const timer = useScheduleTimer(entries);
    const sp = timer && span(timer);
    if (!sp) return null;
    return (
        <div
            className="absolute left-0 -bottom-px h-0.5 bg-amber-500 dark:bg-amber-500"
            style={{ width: `${sp.remaining * 100}%` }}
            aria-hidden="true"
        />
    );
}

/**
 * 残り時間の特大の数字。文字数で割って枠の幅の約9割に収める(Geist の tabular-nums は数字とコロンの平均が
 * 約0.48em。0.5em で見積もって余白を残す)。高さは画面の3割まで。1時間を切ると文字数が減って一段大きくなる。
 */
function BigRemaining({ text }: { text: string }) {
    const widthCqw = Math.floor(88 / (0.5 * text.length));
    return (
        <p className="font-medium leading-none tabular-nums" style={{ fontSize: `min(${widthCqw}cqw, 30svh)` }}>
            {text}
        </p>
    );
}

type ScheduleTimerPanelProps ={ entries: DayEntry[]; onClose: () => void };

/**
 * タイマーのモーダル。外枠と開き方は Inbox・Tasks と同じ(本人指定 2026-10-27)。
 * このモーダルだけは README-design §4 の文字サイズ(text-lg まで)を外す(本人 2026-10-27:「文字はこのモーダルでのみ
 * 無視していい。画面をぜいたくに使い視認性とインパクトを高めよう」)。残り時間の数字は枠の幅に合わせて伸ばすので、
 * Tailwind の段ではなく style の font-size で決める。バーは目盛りを持たない連続のバー(本人選択 同日)。
 */
export function ScheduleTimerPanel({ entries, onClose }: ScheduleTimerPanelProps) {
    const timer = useScheduleTimer(entries);
    const sp = timer && span(timer);
    const s = timer?.state;

    let name = '予定なし';
    let following = '今日の予定はこれで終わり';
    if (timer && s?.kind === 'active') {
        name = s.activity;
        following = s.next ? `次 ${clock(s.next.start, timer.timezone)} ${s.next.activity}` : '次の予定なし';
    } else if (timer && s?.next) {
        following = `${clock(s.next.start, timer.timezone)} から ${s.next.activity}`;
    }

    return (
        <OverlayPanel label="タイマー" onClose={onClose}>
            {/* 4つを1つの塊にして上下中央に置く(本人指定 2026-10-28: 「中央に要素をもう少しギュッと詰めて」)。 */}
            <div className="@container flex min-h-0 flex-1 flex-col justify-center gap-6 p-6 sm:gap-8 sm:p-12">
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                    <p
                        className={`min-w-0 truncate text-4xl font-medium sm:text-6xl ${s?.kind === 'active' ? 'text-neutral-900 dark:text-neutral-50' : 'text-neutral-700 dark:text-neutral-300'}`}
                    >
                        {name}
                    </p>
                    {timer && sp && (
                        <p className="text-lg tabular-nums text-neutral-700 sm:text-2xl dark:text-neutral-300">
                            {clock(sp.from, timer.timezone)}–{clock(sp.to, timer.timezone)}
                        </p>
                    )}
                </div>
                {timer && sp && <BigRemaining text={formatRemaining(sp.to - timer.now)} />}
                {sp && (
                    <div className="relative h-16 overflow-hidden rounded-sm bg-neutral-300 sm:h-24 dark:bg-neutral-700" aria-hidden="true">
                        <div
                            className="absolute inset-y-0 left-0 bg-amber-500 dark:bg-amber-500"
                            style={{ width: `${sp.remaining * 100}%` }}
                        />
                    </div>
                )}
                <p className="text-lg text-neutral-700 sm:text-2xl dark:text-neutral-300">{following}</p>
            </div>
        </OverlayPanel>
    );
}
