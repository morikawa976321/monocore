'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/src/components/ui/Button';

type ProjectMock = {
    id: string;
    body: string;
};

const PROJECT_MOCKS: ProjectMock[] = [
    {
        id: 'project-1',
        body: `# Weekly Planning Revamp
Migrate weekly planning flow to markdown-first notes.

## Goals
- Keep planning in one place
- Reduce context switching`,
    },
    {
        id: 'project-2',
        body: `# Home Inventory Cleanup
Track old devices and decide recycle/sell/keep.

## Next actions
- Photograph items
- Write quick condition notes`,
    },
    {
        id: 'project-3',
        body: `# Reading System v2
Experiment with lightweight reading capture format.

## Idea
Use one short summary and three key quotes.`,
    },
    {
        id: 'project-4',
        body: `# Personal Dashboard Refresh
Improve morning review flow.

## Notes
- Show fewer but stronger signals
- Keep updates under five minutes`,
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

export default function ProjectsPage() {
    const [items, setItems] = useState<ProjectMock[]>(() =>
        PROJECT_MOCKS.map((row) => ({ ...row }))
    );
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const overlayHostRef = useRef<HTMLDivElement>(null);
    const [overlayBox, setOverlayBox] = useState<{ top: number; height: number } | null>(null);
    const selectedProject = useMemo(
        () => items.find((item) => item.id === selectedId) ?? null,
        [items, selectedId]
    );

    function updateProjectBody(id: string, body: string) {
        setItems((prev) => prev.map((p) => (p.id === id ? { ...p, body } : p)));
    }

    const updateOverlayBox = useCallback(() => {
        if (!selectedProject) return;
        const parent = overlayHostRef.current?.parentElement;
        if (parent) setOverlayBox(overlayBoxInParent(parent));
    }, [selectedProject]);

    useLayoutEffect(() => {
        if (!selectedProject) return;
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
    }, [selectedProject, updateOverlayBox]);

    useLayoutEffect(() => {
        if (!selectedProject) return;
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
    }, [selectedProject]);

    useEffect(() => {
        if (!selectedProject) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setSelectedId(null);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [selectedProject]);

    return (
        <div className="flex flex-col h-screen bg-neutral-100 dark:bg-neutral-950">
            <header className="flex items-center px-2 sm:px-6 py-2 sm:py-2 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 shrink-0">
                <h1 className="text-base sm:text-lg font-medium leading-6 sm:leading-7 tracking-widest uppercase text-neutral-900 dark:text-neutral-100">
                    Projects
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

                {selectedProject && (
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
                                aria-label="Project detail"
                                className="pointer-events-auto flex h-full min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded border-2 border-neutral-400 bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-900"
                            >
                                <div className="flex min-h-0 flex-1 flex-col p-4">
                                    <textarea
                                        value={selectedProject.body}
                                        onChange={(e) => updateProjectBody(selectedProject.id, e.target.value)}
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
                                        aria-label="Project詳細を閉じる"
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
