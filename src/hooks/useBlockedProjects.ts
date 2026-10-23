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

/**
 * プロジェクトごとのタスクのカードの取得と編集。
 * 更新は保存できてから画面の行を差し替える。失敗・競合のときは行を変えないので、カードの入力欄は下書きを
 * 持ったままになり、次に欄を離れたときに保存し直す。削除は画面へ先に反映し、失敗したら読み直す。
 */
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
        async (id: string, loadedUpdatedAt: string, patch: BlockedProjectUpdate) => {
            const { data, error: e } = await updateBlockedProject(supabase, id, loadedUpdatedAt, patch);
            if (e) {
                setError('保存に失敗しました。入力は残してあり、もう一度欄を離れると保存し直します。');
                return;
            }
            if (!data) {
                // 読み直すとカードが最新の内容に置き換わり、入力中の下書きは消える。読み直すかは本人に任せる。
                setError('このカードは別の場所で更新されていたので保存していません。入力を控えてから再読み込みしてください。');
                return;
            }
            setProjects((prev) => prev.map((p) => (p.id === id ? data : p)));
            setError(null);
        },
        [supabase]
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
