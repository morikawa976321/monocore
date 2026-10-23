'use client';

import { useMemo } from 'react';
import { PageHeader } from '@/src/components/layout/PageHeader';
import { BlockedProjectCards } from '@/src/components/plan/BlockedProjectCards';
import { LoadingIndicator } from '@/src/components/ui/LoadingIndicator';
import { useBlockedProjects } from '@/src/hooks/useBlockedProjects';
import { createClient } from '@/src/lib/supabase/client';

/** 囲みの外枠と見出しの帯は、予定の板の日付セクション（DaySection）に揃える。 */
const CARD = 'rounded overflow-hidden border border-neutral-400 bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-900';
const CARD_HEADER =
    'px-2 sm:px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50 text-sm leading-6 font-normal text-neutral-700 dark:text-neutral-300';
const CARD_BODY = 'px-2 sm:px-4 py-2';

/** Tasks。枠ごとのタスクの一覧（表示名だけ変え、URL とファイル名は /plan のまま）。枠は src/lib/tasks/slots.ts。 */
export default function PlanPage() {
    const supabase = useMemo(() => createClient(), []);
    const { projects, isLoading, error, reload, createProject, updateProject } = useBlockedProjects(supabase);
    // 読み込み中になるのは最初の読み込みだけ（読み直しは前の内容を持ったまま差し替える）。
    const isInitialLoading = isLoading;

    return (
        <div className="flex flex-col h-screen bg-neutral-100 dark:bg-neutral-950">
            <PageHeader title="Tasks" onRefresh={() => void reload()}>
                {isInitialLoading && (
                    <div className="inline-flex items-center gap-2">
                        <LoadingIndicator />
                        <span className="text-sm text-neutral-700 dark:text-neutral-300">同期中…</span>
                    </div>
                )}
                {error && <span className="text-sm text-amber-600 dark:text-amber-400">{error}</span>}
            </PageHeader>

            <div className="flex-1 overflow-hidden relative">
                <div className="h-full overflow-y-auto px-2 sm:px-6 py-1 sm:py-4 space-y-2 sm:space-y-4">
                    <BlockedProjectCards
                        projects={projects}
                        onCreate={(name, tasks) => void createProject(name, tasks)}
                        onUpdate={(id, loadedUpdatedAt, patch) => void updateProject(id, loadedUpdatedAt, patch)}
                        cardClassName={CARD}
                        headerClassName={CARD_HEADER}
                        bodyClassName={CARD_BODY}
                    />
                </div>

                {isInitialLoading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-100/80 dark:bg-neutral-950/80">
                        <div className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800 rounded p-4">
                            <LoadingIndicator />
                            <span className="text-sm text-neutral-700 dark:text-neutral-300">同期中…</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
