'use client';

import { useMemo } from 'react';
import { CARD, CARD_BODY, CARD_HEADER, NOTICE } from '@/src/components/finance/card';
import { OverlayPanel } from '@/src/components/layout/OverlayPanel';
import { BlockedProjectCards } from '@/src/components/plan/BlockedProjectCards';
import { LoadingIndicator } from '@/src/components/ui/LoadingIndicator';
import { useBlockedProjects } from '@/src/hooks/useBlockedProjects';
import { createClient } from '@/src/lib/supabase/client';

/**
 * Schedules のヘッダーの Tasks ボタンで開くモーダル。枠の4枚のカードを出す（中身と保存は /plan と同じ部品）。
 * 開くたびに読み直すので、閉じている間に AI がスキルで書き換えた内容も開いたときに出る。
 */
export function TasksPanel({ onClose }: { onClose: () => void }) {
    const supabase = useMemo(() => createClient(), []);
    const { projects, isLoading, error, createProject, updateProject } = useBlockedProjects(supabase);
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
                        onCreate={(name, tasks) => void createProject(name, tasks)}
                        onUpdate={(id, loadedUpdatedAt, patch) => void updateProject(id, loadedUpdatedAt, patch)}
                        cardClassName={CARD}
                        headerClassName={CARD_HEADER}
                        bodyClassName={CARD_BODY}
                    />
                )}
            </div>
        </OverlayPanel>
    );
}
