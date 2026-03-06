'use client';

import React, { useRef, useState, useEffect } from 'react';

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

function generateInitialContent(): string {
    const today = new Date(2026, 2, 7); // 2026-03-07 (local)
    const end = new Date(2027, 2, 7);   // 1 year later

    const lines: string[] = [];
    const current = new Date(today);

    while (current <= end) {
        const yyyy = current.getFullYear();
        const mm = String(current.getMonth() + 1).padStart(2, '0');
        const dd = String(current.getDate()).padStart(2, '0');
        const dow = DAY_NAMES[current.getDay()];

        const dateLabel = `${yyyy}/${mm}/${dd} (${dow})`;

        if (lines.length === 0) {
            lines.push(dateLabel);
        } else {
            lines.push('', '', dateLabel);
        }

        current.setDate(current.getDate() + 1);
    }

    return lines.join('\n');
}

const INITIAL_CONTENT = generateInitialContent();

export default function SchedulesPage() {
    const [content, setContent] = useState(INITIAL_CONTENT);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize textarea to fill available space
    useEffect(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.style.height = 'auto';
        ta.style.height = ta.scrollHeight + 'px';
    }, [content]);

    return (
        <div className="flex flex-col h-screen bg-neutral-100 dark:bg-neutral-950">
            {/* Header */}
            <header className="flex items-center px-6 py-3 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 shrink-0">
                <h1 className="text-base font-medium tracking-widest uppercase text-neutral-900 dark:text-neutral-100">
                    Schedules
                </h1>
            </header>

            {/* Textarea area */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
                <textarea
                    ref={textareaRef}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className={[
                        'w-full min-h-full resize-none bg-transparent border-none outline-none',
                        'font-mono text-base leading-7',
                        'text-neutral-900 dark:text-neutral-100',
                        'placeholder:text-neutral-400 dark:placeholder:text-neutral-600',
                    ].join(' ')}
                    spellCheck={false}
                    autoComplete="off"
                    autoCorrect="off"
                />
            </div>
        </div>
    );
}
