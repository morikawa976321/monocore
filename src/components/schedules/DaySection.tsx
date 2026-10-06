import React, { useMemo, useState } from 'react';
import { Undo2 } from 'lucide-react';
import { FreeTimeStrip } from '@/src/components/plan/FreeTimeStrip';
import { AutoHeightTextarea } from '@/src/components/schedules/AutoHeightTextarea';
import { Button } from '@/src/components/ui/Button';
import { analyzeDayContent, formatHours } from '@/src/lib/schedules/free-time';
import { dateLabelToDateStr, hasOrphanLines, type DayEntry } from '@/src/lib/schedules/text-format';

type DaySectionProps = {
    // 1日分の表示データ（見出し日付 + 本文）。
    entry: DayEntry;
    // 今日かどうかで見た目を変える。
    isToday: boolean;
    // 今日の位置へスクロールするための参照。
    todayRef?: React.Ref<HTMLElement>;
    // テキスト変更時の通知。
    onContentChange: (value: string) => void;
    // 自由記述メモと変更時の通知。
    note: string;
    onNoteChange: (value: string) => void;
    // フォーカス開始/終了時の通知（保存制御に使う）。
    onFocus: () => void;
    onBlur: () => void;
    // DB同期中は編集を無効化する。
    isReadOnly?: boolean;
    // 今日だけ渡す。空きの帯に今の時刻の線を引く。
    nowMinutes?: number;
};

export function DaySection({
    entry,
    isToday,
    todayRef,
    onContentChange,
    note,
    onNoteChange,
    onFocus,
    onBlur,
    isReadOnly = false,
    nowMinutes,
}: DaySectionProps) {
    const [previousContent, setPreviousContent] = useState<string | null>(null);
    // 打つたびに再計算する（1日分なので軽い）。/plan の目標の判定と同じ計算。
    const freeTime = useMemo(() => analyzeDayContent(entry.content), [entry.content]);

    const handleUndo = () => {
        if (previousContent === null) return;
        const current = entry.content;
        onContentChange(previousContent);
        setPreviousContent(current);
    };

    return (
        <section
            // 今日のセクションだけ親から渡されたrefを当て、初期スクロール先に使う。
            ref={isToday ? todayRef : null}
            // /plan の日ごとの一覧から ?day=YYYY-MM-DD で飛んでくる先。
            id={`day-${dateLabelToDateStr(entry.dateLabel)}`}
            className={`group rounded bg-neutral-50 dark:bg-neutral-900 overflow-hidden ${isToday
                    ? 'border-2 border-amber-500 dark:border-amber-500'
                    : 'border border-neutral-400 dark:border-neutral-600'
                }`}
        >
            {/* 日付行。本文の解析結果に応じて警告ラベルも表示する。 */}
            <header className="px-2 sm:px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50 text-sm leading-6 flex items-center justify-between">
                <div className="flex items-center text-neutral-700 dark:text-neutral-300">
                    <span>{entry.dateLabel}</span>
                    {/* テキスト形式の解析で不正行がある日だけ警告表示する。 */}
                    {hasOrphanLines(entry.content) && (
                        <span className="ml-2 px-1 py-0.5 rounded-sm border border-amber-500 dark:border-amber-400 text-amber-600 dark:text-amber-400 text-sm font-medium leading-none">
                            Invalid format
                        </span>
                    )}
                </div>
                {/* 空きの帯は見出し行の中に置き、カードの高さを増やさない(下の最低高のコメントと同じ理由で、
                    60日分のスクロール長が伸びるのを避ける)。スマホは幅が無いので数値だけ。 */}
                <div className="hidden sm:block min-w-0 flex-1 px-4">
                    <FreeTimeStrip analysis={freeTime} nowMinutes={isToday ? nowMinutes : undefined} />
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 sm:gap-4 text-neutral-700 dark:text-neutral-300">
                        <span>
                            空き{' '}
                            <span className="font-medium text-neutral-900 dark:text-neutral-50">
                                {formatHours(freeTime.freeMinutes)}h
                            </span>
                        </span>
                        {/* スマホは日付・記法警告・元に戻すと並ぶと幅が足りないので「空き」だけ。 */}
                        <span className="hidden sm:inline">
                            最大{' '}
                            <span className="font-medium text-neutral-900 dark:text-neutral-50">
                                {formatHours(freeTime.maxGapMinutes)}h
                            </span>
                        </span>
                    </div>
                    {previousContent !== null && previousContent !== entry.content && (
                        <div className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150">
                            <Button
                                color="ghost"
                                size="icon"
                                title="元に戻す"
                                onClick={handleUndo}
                                className="-mr-2"
                            >
                                <Undo2 className="w-4 h-4" />
                            </Button>
                        </div>
                    )}
                </div>
            </header>
            {/* 予定と自由記述メモ。高さはそれぞれ入力量に合わせて自動調整。
                PC は横並びで予定:メモ = 3:2(2026-08-05 本人指定)、スマホは縦積み(375px で横2分割は両方使えない)。 */}
            {/* 仕切り線はセクションの外枠より一段濃くする。プレースホルダを置かないぶん、
                予定欄とメモ欄の境目はこの線だけが示すため。 */}
            {/* 最低高 min-h-6 + py-2 = 40px(1行 + 余白)。旧 64px(3行相当)のままメモ欄を縦に足すと、
                ほぼ空の未来2か月(約60日)で約3,900px 余計にスクロールする。24px(余白なし)だと
                スマホで予定欄とメモ欄が隣接してタップし分けられず(推奨 44px 前後)、記法警告も出ない
                メモ欄へ予定を書く無言の失敗になる。40px はその妥協。 */}
            <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-neutral-300 dark:divide-neutral-700 px-1 sm:px-4 py-0 sm:py-2">
                <div className="sm:basis-3/5 sm:min-w-0 sm:pr-4">
                    <AutoHeightTextarea
                        value={entry.content}
                        onChange={(e) => {
                            setPreviousContent(entry.content);
                            onContentChange(e.target.value);
                        }}
                        onFocus={onFocus}
                        onBlur={onBlur}
                        readOnly={isReadOnly}
                        className={[
                            'min-h-6 py-2 resize-none',
                            'leading-6 sm:text-base sm:leading-7',
                            isReadOnly ? 'cursor-not-allowed' : '',
                        ].join(' ')}
                        spellCheck={false}
                        autoComplete="off"
                        autoCorrect="off"
                        rows={1}
                    />
                </div>
                <div className="sm:basis-2/5 sm:min-w-0 sm:pl-4">
                    <AutoHeightTextarea
                        value={note}
                        onChange={(e) => onNoteChange(e.target.value)}
                        readOnly={isReadOnly}
                        className={[
                            'min-h-6 py-2 resize-none',
                            'leading-6 sm:text-base sm:leading-7',
                            isReadOnly ? 'cursor-not-allowed' : '',
                        ].join(' ')}
                        spellCheck={false}
                        autoComplete="off"
                        autoCorrect="off"
                        rows={1}
                    />
                </div>
            </div>
        </section>
    );
}
