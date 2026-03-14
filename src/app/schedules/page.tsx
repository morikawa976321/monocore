'use client';

import React, { useState, useRef, useEffect } from 'react';

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

type DayEntry = { dateLabel: string; content: string };

function generateDayEntries(): DayEntry[] {
    // TODO: 今日の日付を取得して、その日が一番上になるように表示する
    // TODO: 無限スクロールを実装する（上はデフォルトで2週間前、下は半年先まで表示。交差監視方式により実装）
    const today = new Date(2026, 2, 15); // 2026-03-15 (local)
    const end = new Date(2027, 2, 15);   // 1 year later

    const entries: DayEntry[] = [];
    const current = new Date(today);

    while (current <= end) {
        const yyyy = current.getFullYear();
        const mm = String(current.getMonth() + 1).padStart(2, '0');
        const dd = String(current.getDate()).padStart(2, '0');
        const dow = DAY_NAMES[current.getDay()];
        entries.push({
            dateLabel: `${yyyy}/${mm}/${dd} (${dow})`,
            content: '',
        });
        current.setDate(current.getDate() + 1);
    }

    return entries;
}

const INITIAL_ENTRIES = generateDayEntries();

function AutoHeightTextarea({
    value,
    onChange,
    className,
    ...props
}: React.ComponentPropsWithoutRef<'textarea'>) {
    const ref = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const ta = ref.current;
        if (!ta) return;
        ta.style.height = 'auto';
        const str = typeof value === 'string' ? value : '';
        if (str.trim().length > 0) {
            ta.style.height = ta.scrollHeight + 'px';
        }
    }, [value]);

    return (
        <textarea
            ref={ref}
            value={value}
            onChange={onChange}
            className={className}
            style={{ overflow: 'hidden' }}
            {...props}
        />
    );
}

export default function SchedulesPage() {
    const [entries, setEntries] = useState<DayEntry[]>(INITIAL_ENTRIES);

    const updateDayContent = (index: number, value: string) => {
        setEntries((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], content: value };
            return next;
        });
    };

    return (
        <div className="flex flex-col h-screen bg-neutral-100 dark:bg-neutral-950">
            {/* Header */}
            <header className="flex items-center px-6 py-3 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 shrink-0">
                <h1 className="text-base font-medium tracking-widest uppercase text-neutral-900 dark:text-neutral-100">
                    Schedules
                </h1>
            </header>

            {/* Day sections */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                {entries.map((entry, index) => (
                    <section
                        key={entry.dateLabel}
                        className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden"
                    >
                        <header className="px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50 font-mono text-sm text-neutral-700 dark:text-neutral-300">
                            {entry.dateLabel}
                        </header>
                        <div className="p-3">
                            <AutoHeightTextarea
                                value={entry.content}
                                onChange={(e) => updateDayContent(index, e.target.value)}
                                className={[
                                    'w-full min-h-[4rem] resize-none bg-transparent border-none outline-none',
                                    'font-mono text-base leading-7',
                                    'text-neutral-900 dark:text-neutral-100',
                                    'placeholder:text-neutral-400 dark:placeholder:text-neutral-600',
                                ].join(' ')}
                                spellCheck={false}
                                autoComplete="off"
                                autoCorrect="off"
                                rows={3}
                            />
                        </div>
                    </section>
                ))}
            </div>
        </div>
    );
}
