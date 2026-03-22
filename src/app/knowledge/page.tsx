'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/src/components/ui/Button';

type KnowledgeMock = {
    id: string;
    body: string;
};

const KNOWLEDGE_MOCKS: KnowledgeMock[] = [
    {
        id: 'knowledge-1',
        body: `# Daily Review Template aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
Use this template at the end of each day.

## Reflection
- What moved forward?
- What is still blocked?`,
    },
    {
        id: 'knowledge-2',
        body: `# Meeting Notes Pattern
Capture decisions first, details second.

## Rule
One page per meeting, one summary sentence first.`,
    },
    {
        id: 'knowledge-3',
        body: `# Writing Checklist
Keep writing output concise and explicit.

## Before publish
- Clarify audience
- Add concrete examples`,
    },
    {
        id: 'knowledge-4',
        body: `# Lightweight Research Log
Store small findings continuously.

## Format
Question, observation, next action.`,
    },
];

function overlayBoxInParent(parent: HTMLElement): { top: number; height: number } {
    const rect = parent.getBoundingClientRect();
    const viewport = window.visualViewport;
    if (!viewport) return { top: 0, height: parent.clientHeight };
    const visibleTop = Math.max(rect.top, viewport.offsetTop);
    const visibleBottom = Math.min(rect.bottom, viewport.offsetTop + viewport.height);
    return { top: visibleTop - rect.top, height: Math.max(0, visibleBottom - visibleTop) };
}

function extractCardTitle(markdown: string): string {
    const [firstLine = ''] = markdown.split('\n');
    const match = firstLine.match(/^#\s+(.+)$/);
    return match?.[1]?.trim() || firstLine.trim() || 'Untitled';
}

export default function KnowledgePage() {
    const [items, setItems] = useState<KnowledgeMock[]>(() =>
        KNOWLEDGE_MOCKS.map((row) => ({ ...row }))
    );
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const overlayHostRef = useRef<HTMLDivElement>(null);
    const [overlayBox, setOverlayBox] = useState<{ top: number; height: number } | null>(null);
    const selectedKnowledge = useMemo(
        () => items.find((item) => item.id === selectedId) ?? null,
        [items, selectedId]
    );

    function updateKnowledgeBody(id: string, body: string) {
        setItems((prev) => prev.map((p) => (p.id === id ? { ...p, body } : p)));
    }

    const updateOverlayBox = useCallback(() => {
        if (!selectedKnowledge) return;
        const parent = overlayHostRef.current?.parentElement;
        if (parent) setOverlayBox(overlayBoxInParent(parent));
    }, [selectedKnowledge]);

    useLayoutEffect(() => {
        if (!selectedKnowledge) return;
        updateOverlayBox();
        const viewport = window.visualViewport;
        viewport?.addEventListener('resize', updateOverlayBox);
        viewport?.addEventListener('scroll', updateOverlayBox);
        window.addEventListener('resize', updateOverlayBox);
        const parent = overlayHostRef.current?.parentElement;
        const observer = parent ? new ResizeObserver(updateOverlayBox) : null;
        if (parent && observer) observer.observe(parent);
        return () => {
            viewport?.removeEventListener('resize', updateOverlayBox);
            viewport?.removeEventListener('scroll', updateOverlayBox);
            window.removeEventListener('resize', updateOverlayBox);
            observer?.disconnect();
        };
    }, [selectedKnowledge, updateOverlayBox]);

    useLayoutEffect(() => {
        if (!selectedKnowledge) return;
        const scrollY = window.scrollY;
        const html = document.documentElement;
        const body = document.body;
        const prevHtmlOverflow = html.style.overflow;
        const prev = {
            overflow: body.style.overflow,
            position: body.style.position,
            top: body.style.top,
            width: body.style.width,
            left: body.style.left,
            right: body.style.right,
        };

        html.style.overflow = 'hidden';
        body.style.overflow = 'hidden';
        body.style.position = 'fixed';
        body.style.top = `-${scrollY}px`;
        body.style.width = '100%';
        body.style.left = '0';
        body.style.right = '0';

        return () => {
            html.style.overflow = prevHtmlOverflow;
            body.style.overflow = prev.overflow;
            body.style.position = prev.position;
            body.style.top = prev.top;
            body.style.width = prev.width;
            body.style.left = prev.left;
            body.style.right = prev.right;
            window.scrollTo(0, scrollY);
        };
    }, [selectedKnowledge]);

    useEffect(() => {
        if (!selectedKnowledge) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setSelectedId(null);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [selectedKnowledge]);

    return (
        <div className="flex flex-col h-screen bg-neutral-100 dark:bg-neutral-950">
            <header className="flex items-center px-2 sm:px-6 py-2 sm:py-2 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 shrink-0">
                <h1 className="text-base sm:text-lg font-medium leading-6 sm:leading-7 tracking-widest uppercase text-neutral-900 dark:text-neutral-100">
                    Knowledge
                </h1>
            </header>

            <div className="relative flex-1 overflow-hidden">
                <div className="h-full overflow-y-auto px-2 sm:px-6 py-4 sm:py-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-2">
                        {items.map((item) => {
                            const cardTitle = extractCardTitle(item.body);
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    title={cardTitle}
                                    onClick={() => setSelectedId(item.id)}
                                    className="min-w-0 w-full rounded border border-neutral-400 bg-neutral-50 p-1 text-left transition-colors duration-150 ease-in-out hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:hover:bg-neutral-800 dark:focus-visible:ring-neutral-50 sm:p-2"
                                >
                                    <p className="truncate text-sm leading-6 text-neutral-900 dark:text-neutral-50 sm:text-base sm:leading-7">
                                        {cardTitle}
                                    </p>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {selectedKnowledge && (
                    <>
                        <div
                            className="absolute inset-0 z-40 bg-neutral-950/50"
                            onClick={() => setSelectedId(null)}
                            aria-hidden="true"
                        />
                        <div
                            ref={overlayHostRef}
                            className="pointer-events-none absolute left-0 right-0 z-50 flex flex-col items-center p-4 sm:p-6"
                            style={
                                overlayBox
                                    ? { top: overlayBox.top, height: overlayBox.height, bottom: 'auto' }
                                    : { top: 0, bottom: 0 }
                            }
                        >
                            <aside
                                role="dialog"
                                aria-modal="true"
                                aria-label="Knowledge detail"
                                className="pointer-events-auto flex h-full min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded border-2 border-neutral-400 bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-900"
                            >
                                <div className="flex min-h-0 flex-1 flex-col p-4">
                                    <textarea
                                        value={selectedKnowledge.body}
                                        onChange={(e) => updateKnowledgeBody(selectedKnowledge.id, e.target.value)}
                                        className="min-h-0 w-full flex-1 resize-none overflow-y-auto bg-transparent text-sm leading-6 sm:text-base sm:leading-7 text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-neutral-100 dark:placeholder:text-neutral-600"
                                        spellCheck={false}
                                        autoComplete="off"
                                        autoCorrect="off"
                                    />
                                </div>
                                <div className="flex shrink-0 justify-end border-t border-neutral-200 px-2 py-2 dark:border-neutral-800">
                                    <Button
                                        type="button"
                                        color="secondary"
                                        size="md"
                                        onClick={() => setSelectedId(null)}
                                        aria-label="Knowledge詳細を閉じる"
                                    >
                                        閉じる
                                    </Button>
                                </div>
                            </aside>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
