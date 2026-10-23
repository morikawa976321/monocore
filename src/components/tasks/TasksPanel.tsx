'use client';

import { CARD, CARD_BODY, CARD_HEADER, NOTICE } from '@/src/components/finance/card';
import { OverlayPanel } from '@/src/components/layout/OverlayPanel';
import { BlockedProjectCards } from '@/src/components/tasks/BlockedProjectCards';
import { LoadingIndicator } from '@/src/components/ui/LoadingIndicator';
import type { BlockedProjectRow, BlockedProjectUpdate } from '@/src/lib/supabase/queries/blocked-projects';

type TasksPanelProps = {
    projects: BlockedProjectRow[];
    /** 最初の読み込みが終わっていない。読み直しの間は前の内容を出したままにするので、ここでは覆いを出さない。 */
    isLoading: boolean;
    error: string | null;
    onCreate: (name: string, tasks: string) => void;
    onUpdate: (id: string, loadedUpdatedAt: string, patch: BlockedProjectUpdate) => void;
    onClose: () => void;
};

/**
 * Schedules のヘッダーの Tasks ボタンで開くモーダル。枠の4枚のカードを出す（2026-10-23 に /plan のページから移した）。
 * 中身は Schedules のページが持つ（useBlockedProjects）。開いたらすぐ手元の内容を出し、ページ側が裏で読み直す。
 */
export function TasksPanel({ projects, isLoading, error, onCreate, onUpdate, onClose }: TasksPanelProps) {
    return (
        <OverlayPanel label="Tasks" onClose={onClose} fitContent>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
                {error && <p className={NOTICE}>{error}</p>}
                {isLoading ? (
                    <div className="flex justify-center py-2">
                        <LoadingIndicator />
                    </div>
                ) : (
                    <BlockedProjectCards
                        projects={projects}
                        onCreate={onCreate}
                        onUpdate={onUpdate}
                        cardClassName={CARD}
                        headerClassName={CARD_HEADER}
                        bodyClassName={CARD_BODY}
                    />
                )}
            </div>
        </OverlayPanel>
    );
}
