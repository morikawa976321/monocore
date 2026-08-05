import React, { useState } from 'react';
import { Undo2 } from 'lucide-react';
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
    // 自由記述メモと変更時の通知。
    note: string;
    onNoteChange: (value: string) => void;
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
    note,
    onNoteChange,
    onFocus,
    onBlur,
    isReadOnly = false,
}: DaySectionProps) {
    const [previousContent, setPreviousContent] = useState<string | null>(null);

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
                {previousContent !== null && previousContent !== entry.content && (
                    <div className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150">
                        <button
                            type="button"
                            title="元に戻す"
                            onClick={handleUndo}
                            className="p-2 -mr-2 rounded-sm transition-colors text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-700 hover:text-neutral-900 dark:hover:text-neutral-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
                        >
                            <Undo2 className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </header>
            {/* 予定と自由記述メモ。高さはそれぞれ入力量に合わせて自動調整。 */}
            <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-neutral-200 dark:divide-neutral-800 px-1 sm:px-4 py-0 sm:py-2">
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
                            'w-full min-h-6 py-2 resize-none bg-transparent border-none outline-none',
                            'text-sm leading-6 sm:text-base sm:leading-7',
                            'text-neutral-900 dark:text-neutral-100',
                            'placeholder:text-neutral-400 dark:placeholder:text-neutral-600',
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
                        placeholder="notes"
                        className={[
                            'w-full min-h-6 py-2 resize-none bg-transparent border-none outline-none',
                            'text-sm leading-6 sm:text-base sm:leading-7',
                            'text-neutral-900 dark:text-neutral-100',
                            'placeholder:text-neutral-400 dark:placeholder:text-neutral-600',
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
