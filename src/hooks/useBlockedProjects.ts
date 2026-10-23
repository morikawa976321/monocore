'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/src/types/database.types';
import {
    deleteBlockedProject,
    getBlockedProjects,
    insertBlockedProject,
    updateBlockedProject,
    type BlockedProjectRow,
    type BlockedProjectUpdate,
} from '@/src/lib/supabase/queries/blocked-projects';

/** プロジェクトごとのタスクのカードの取得と編集。編集は画面へ先に反映し、保存に失敗したら読み直す。 */
export function useBlockedProjects(supabase: SupabaseClient<Database>) {
    const [projects, setProjects] = useState<BlockedProjectRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const reload = useCallback(async () => {
        const { data, error: e } = await getBlockedProjects(supabase);
        if (e) {
            setError('プロジェクトの読み込みに失敗しました。');
        } else {
            setProjects(data ?? []);
            setError(null);
        }
        setIsLoading(false);
    }, [supabase]);

    useEffect(() => {
        void reload();
    }, [reload]);

    const addProject = useCallback(async () => {
        const { data, error: e } = await insertBlockedProject(supabase);
        if (e || !data) {
            setError('プロジェクトの追加に失敗しました。');
            return;
        }
        setProjects((prev) => [...prev, data]);
        setError(null);
    }, [supabase]);

    const updateProject = useCallback(
        async (id: string, patch: BlockedProjectUpdate) => {
            setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
            const { error: e } = await updateBlockedProject(supabase, id, patch);
            if (e) {
                setError('プロジェクトの保存に失敗しました。');
                void reload();
            }
        },
        [supabase, reload]
    );

    const removeProject = useCallback(
        async (id: string) => {
            setProjects((prev) => prev.filter((p) => p.id !== id));
            const { error: e } = await deleteBlockedProject(supabase, id);
            if (e) {
                setError('プロジェクトの削除に失敗しました。');
                void reload();
            }
        },
        [supabase, reload]
    );

    return { projects, isLoading, error, reload, addProject, updateProject, removeProject };
}
