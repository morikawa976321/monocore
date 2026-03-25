import React from 'react';
import { AutoHeightTextarea } from '@/src/components/schedules/AutoHeightTextarea';
import { hasOrphanLines, type DayEntry } from '@/src/lib/schedules/text-format';

type DaySectionProps = {
    // 1日分の表示データ（見出し日付 + 本文）。
    entry: DayEntry;
    // 今日かどうかで見た目を変える。
    isToday: boolean;
    // 今日の位置へスクロールするための参照。
    todayRef?: React.Ref<HTMLElement>;
    // テキスト変更時の通知。
    onContentChange: (value: string) => void;
    // フォーカス開始/終了時の通知（保存制御に使う）。
    onFocus: () => void;
    onBlur: () => void;
    // DB同期中は編集を無効化する。
    isReadOnly?: boolean;
};

export function DaySection({
    entry,
    isToday,
    todayRef,
    onContentChange,
    onFocus,
    onBlur,
    isReadOnly = false,
}: DaySectionProps) {
    return (
        <section
            // 今日のセクションだけ親から渡されたrefを当て、初期スクロール先に使う。
            ref={isToday ? todayRef : null}
            className={`rounded bg-neutral-50 dark:bg-neutral-900 overflow-hidden ${
                isToday
                    ? 'border-2 border-amber-500 dark:border-amber-500'
                    : 'border border-neutral-400 dark:border-neutral-600'
            }`}
        >
            {/* 日付行。本文の解析結果に応じて警告ラベルも表示する。 */}
            <header className="px-2 sm:px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50 text-sm leading-6 text-neutral-700 dark:text-neutral-300 flex items-center">
                <span>{entry.dateLabel}</span>
                {/* テキスト形式の解析で不正行がある日だけ警告表示する。 */}
                {hasOrphanLines(entry.content) && (
                    <span className="ml-2 px-1 py-0.5 rounded-sm border border-amber-500 dark:border-amber-400 text-amber-600 dark:text-amber-400 text-sm font-medium leading-none">
                        Invalid format
                    </span>
                )}
            </header>
            {/* 1日分の本文編集エリア。高さは入力量に合わせて自動調整。 */}
            <div className="p-1 sm:p-4">
                <AutoHeightTextarea
                    value={entry.content}
                    onChange={(e) => onContentChange(e.target.value)}
                    onFocus={onFocus}
                    onBlur={onBlur}
                    readOnly={isReadOnly}
                    className={[
                        'w-full min-h-[4rem] resize-none bg-transparent border-none outline-none',
                        'text-sm leading-6 sm:text-base sm:leading-7',
                        'text-neutral-900 dark:text-neutral-100',
                        'placeholder:text-neutral-400 dark:placeholder:text-neutral-600',
                        isReadOnly ? 'cursor-not-allowed' : '',
                    ].join(' ')}
                    spellCheck={false}
                    autoComplete="off"
                    autoCorrect="off"
                    rows={3}
                />
            </div>
        </section>
    );
}
