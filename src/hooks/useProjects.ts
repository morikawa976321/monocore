import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/src/types/database.types';
import {
    createProject as insertProject,
    getProjectById,
    listProjects,
    reorderProjects,
    updateProject,
    updateProjectStatus,
    type ProjectListRow,
    type ProjectStatus,
} from '@/src/lib/supabase/queries/projects';
import { applyReorderToList } from '@/src/lib/resource/reorder';

type ProjectRow = Database['public']['Tables']['projects']['Row'];

type UseProjectsReturn = {
    list: ProjectListRow[];
    /** 一覧が空の初回 fetch 中のみ true */
    listInitialLoading: boolean;
    /** 一覧ありの裏更新中 */
    isRefreshing: boolean;
    listError: Error | null;
    selectedId: string | null;
    setSelectedId: (id: string | null) => void;
    /** 未送信の本文を保存してから詳細を閉じる（失敗時はモーダルを開いたまま）。 */
    closeDetail: () => Promise<void>;
    detail: ProjectRow | null;
    detailLoading: boolean;
    detailError: Error | null;
    updateProjectBody: (value: string) => void;
    saveProjectNow: () => void;
    addProject: (body: string) => Promise<{ data: ProjectRow | null; error: Error | null }>;
    /** 新規モーダルの自動保存用（選択中の詳細と無関係に id 指定で更新）。 */
    saveProjectBodyForId: (id: string, body: string) => Promise<boolean>;
    updateProjectStatusItem: (id: string, status: ProjectStatus) => Promise<boolean>;
    hasPendingChanges: boolean;
    fetchList: (status: ProjectStatus) => Promise<void>;
    reorderList: (orderedIds: string[]) => Promise<boolean>;
};

/** 連続入力時の DB 更新間隔（ms）。 */
const SAVE_DEBOUNCE_MS = 500;

function listRowToDetailPlaceholder(row: ProjectListRow): ProjectRow {
    return {
        id: row.id,
        title: row.title,
        body: '',
        created_at: row.created_at,
        updated_at: row.updated_at,
        sort_order: row.sort_order,
        status: row.status,
        status_changed_at: row.status_changed_at,
        updated_by: 'user',
        user_id: '',
    };
}

export function useProjects(supabase: SupabaseClient<Database>): UseProjectsReturn {
    const [list, setList] = useState<ProjectListRow[]>([]);
    const [listInitialLoading, setListInitialLoading] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [listError, setListError] = useState<Error | null>(null);
    const listRef = useRef(list);
    listRef.current = list;
    const lastStatusRef = useRef<ProjectStatus>('active');

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [detail, setDetail] = useState<ProjectRow | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState<Error | null>(null);
    const [hasPendingChanges, setHasPendingChanges] = useState(false);
    const hasPendingChangesRef = useRef(hasPendingChanges);
    hasPendingChangesRef.current = hasPendingChanges;

    /** 保存・effect cleanup 用の最新本文（state より先に確実に読む）。 */
    const bodyRef = useRef('');
    /** getProjectById が完了し、編集してよい行か判定する。 */
    const lastLoadedIdRef = useRef<string | null>(null);
    /** 詳細が進行中でなければ保存・編集をスキップする。 */
    const isDetailReadOnlyRef = useRef(false);
    /** 非同期 update 完了時、もう別行を見ていれば detail を上書きしない。 */
    const selectedIdRef = useRef<string | null>(null);
    const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    selectedIdRef.current = selectedId;

    const clearSaveDebounce = useCallback(() => {
        if (!saveDebounceRef.current) return;
        clearTimeout(saveDebounceRef.current);
        saveDebounceRef.current = null;
    }, []);

    const persistProject = useCallback(
        async (id: string, body: string): Promise<boolean> => {
            const { data, error } = await updateProject(supabase, id, body);
            if (error) {
                if (selectedIdRef.current === id) setDetailError(error);
                return false;
            }
            if (!data) return false;
            if (selectedIdRef.current === id) setDetailError(null);
            // title / updated_at は DB トリガーで body から更新される
            setList((prev) =>
                prev.map((row) =>
                    row.id === data.id
                        ? {
                            ...row,
                            title: data.title,
                            updated_at: data.updated_at,
                        }
                        : row
                )
            );
            if (selectedIdRef.current === data.id) {
                // body は上書きしない: setDetail(data) で value が変わると
                // controlled textarea がカーソル位置を末尾にリセットしてしまうため。
                // DB トリガーで変わる title / updated_at だけ差し替える。
                setDetail((prev) =>
                    prev ? { ...prev, title: data.title, updated_at: data.updated_at } : null
                );
                if (saveDebounceRef.current == null) {
                    setHasPendingChanges(false);
                }
            }
            return true;
        },
        [supabase]
    );

    const saveProjectNow = useCallback(() => {
        clearSaveDebounce();
        const id = selectedId;
        if (!id || lastLoadedIdRef.current !== id || isDetailReadOnlyRef.current) return;
        void persistProject(id, bodyRef.current);
    }, [clearSaveDebounce, persistProject, selectedId]);

    const fetchList = useCallback(async (status: ProjectStatus) => {
        lastStatusRef.current = status;
        const isInitial = listRef.current.length === 0;
        if (isInitial) {
            setListInitialLoading(true);
        } else {
            setIsRefreshing(true);
        }
        setListError(null);
        // body は取らず、sort_order 昇順（クエリ側の仕様）
        const { data, error } = await listProjects(supabase, status);
        if (error) {
            setListError(error);
            if (isInitial) setList([]);
        } else {
            setList(data ?? []);
        }
        setListInitialLoading(false);
        setIsRefreshing(false);
    }, [supabase]);

    // 選択 ID に応じて詳細を読み込む。別行へ移動時はクリーンアップで未デバウンス分を保存。閉じるは closeDetail が await 保存済みのためクリーンアップでは二重保存されない。
    useEffect(() => {
        if (!selectedId) {
            lastLoadedIdRef.current = null;
            isDetailReadOnlyRef.current = false;
            setDetail(null);
            setDetailLoading(false);
            setDetailError(null);
            bodyRef.current = '';
            setHasPendingChanges(false);
            return;
        }

        let cancelled = false;
        setDetailLoading(true);
        setDetailError(null);
        lastLoadedIdRef.current = null;
        isDetailReadOnlyRef.current = false;
        bodyRef.current = '';

        const listRow = listRef.current.find((row) => row.id === selectedId);
        if (listRow) {
            setDetail(listRowToDetailPlaceholder(listRow));
        } else {
            setDetail(null);
        }

        void getProjectById(supabase, selectedId).then(({ data, error }) => {
            if (cancelled) return;
            if (error) {
                setDetailError(error);
                setDetail(null);
                isDetailReadOnlyRef.current = false;
                setHasPendingChanges(false);
            } else if (data) {
                setDetail(data);
                bodyRef.current = data.body;
                lastLoadedIdRef.current = data.id;
                isDetailReadOnlyRef.current = data.status !== 'active';
                setHasPendingChanges(false);
            }
            setDetailLoading(false);
        });

        return () => {
            cancelled = true;
            clearSaveDebounce();
            const idToFlush = selectedId;
            if (lastLoadedIdRef.current === idToFlush && !isDetailReadOnlyRef.current) {
                void persistProject(idToFlush, bodyRef.current);
            }
            lastLoadedIdRef.current = null;
            isDetailReadOnlyRef.current = false;
        };
    }, [clearSaveDebounce, persistProject, selectedId, supabase]);

    useEffect(() => {
        return () => {
            clearSaveDebounce();
        };
    }, [clearSaveDebounce]);

    // タブ非表示・離脱時にデバウンス待ちを即保存（未送信のままにしない）
    // PCタブ切り替え・スマホ最小化からの復帰時（visible）に、未保存変更がなければ最新データを自動取得する
    useEffect(() => {
        const flushPendingSave = () => {
            if (saveDebounceRef.current == null) return;
            saveProjectNow();
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                flushPendingSave();
            } else if (document.visibilityState === 'visible') {
                // 入力途中で未保存の変更がある場合は、上書きを防ぐためリロードしない
                if (hasPendingChangesRef.current) return;

                void fetchList(lastStatusRef.current);

                const currentSelectedId = selectedIdRef.current;
                if (currentSelectedId) {
                    setDetailLoading(true);
                    setDetailError(null);
                    const listRow = listRef.current.find((row) => row.id === currentSelectedId);
                    if (listRow) {
                        setDetail(listRowToDetailPlaceholder(listRow));
                    }
                    void getProjectById(supabase, currentSelectedId).then(({ data, error }) => {
                        // ロード中に選択行が変わっていたら無視
                        if (selectedIdRef.current !== currentSelectedId) return;
                        if (hasPendingChangesRef.current) return;

                        if (error) {
                            setDetailError(error);
                            setDetail(null);
                            isDetailReadOnlyRef.current = false;
                            setHasPendingChanges(false);
                        } else if (data) {
                            setDetail(data);
                            bodyRef.current = data.body;
                            lastLoadedIdRef.current = data.id;
                            isDetailReadOnlyRef.current = data.status !== 'active';
                            setHasPendingChanges(false);
                        }
                        setDetailLoading(false);
                    });
                }
            }
        };
        const handlePageHide = () => {
            flushPendingSave();
        };
        const handleFreeze = () => {
            flushPendingSave();
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('pagehide', handlePageHide);
        window.addEventListener('freeze', handleFreeze);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('pagehide', handlePageHide);
            window.removeEventListener('freeze', handleFreeze);
        };
    }, [saveProjectNow, fetchList, supabase]);

    const updateProjectBody = useCallback(
        (value: string) => {
            const id = selectedId;
            // 取得完了前・進行中以外の入力は無視
            if (!id || lastLoadedIdRef.current !== id || isDetailReadOnlyRef.current) return;
            setDetail((prev) => (prev ? { ...prev, body: value } : null));
            bodyRef.current = value;
            setHasPendingChanges(true);

            clearSaveDebounce();
            saveDebounceRef.current = setTimeout(() => {
                saveDebounceRef.current = null;
                void persistProject(id, bodyRef.current);
            }, SAVE_DEBOUNCE_MS);
        },
        [clearSaveDebounce, persistProject, selectedId]
    );

    /**
     * 閉じる操作はすべてここに集約。先に未送信本文を保存し、成功後に選択解除。
     * lastLoadedIdRef を先に無効化し、selectedId を null にしたときの effect クリーンアップと二重保存しない。
     */
    const closeDetail = useCallback(async () => {
        clearSaveDebounce();
        const id = selectedId;
        if (id && lastLoadedIdRef.current === id && !isDetailReadOnlyRef.current) {
            const ok = await persistProject(id, bodyRef.current);
            if (!ok) return;
        }
        lastLoadedIdRef.current = null;
        isDetailReadOnlyRef.current = false;
        setHasPendingChanges(false);
        setSelectedId(null);
    }, [clearSaveDebounce, persistProject, selectedId]);

    /** ページの「新規追加」モーダルから呼ぶ。成功時は一覧先頭に差し込む。 */
    const addProject = useCallback(
        async (body: string) => {
            const { data, error } = await insertProject(supabase, body);
            if (error || !data) {
                return { data: null, error: error ?? new Error('create failed') };
            }
            const listRow: ProjectListRow = {
                id: data.id,
                title: data.title,
                created_at: data.created_at,
                updated_at: data.updated_at,
                sort_order: data.sort_order,
                status: data.status,
                status_changed_at: data.status_changed_at,
            };
            setList((prev) => [listRow, ...prev]);
            return { data, error: null };
        },
        [supabase]
    );

    const saveProjectBodyForId = useCallback(
        async (id: string, body: string) => persistProject(id, body),
        [persistProject]
    );

    const updateProjectStatusItem = useCallback(
        async (id: string, status: ProjectStatus) => {
            const { error } = await updateProjectStatus(supabase, id, status);
            if (error) return false;
            setList((prev) => prev.filter((row) => row.id !== id));
            return true;
        },
        [supabase]
    );

    const reorderList = useCallback(
        async (orderedIds: string[]) => {
            let previous: ProjectListRow[] = [];
            setList((prev) => {
                previous = prev;
                return applyReorderToList(prev, orderedIds);
            });
            const { error } = await reorderProjects(supabase, orderedIds);
            if (error) {
                setList(previous);
                return false;
            }
            return true;
        },
        [supabase]
    );

    return {
        list,
        listInitialLoading,
        isRefreshing,
        listError,
        selectedId,
        setSelectedId,
        closeDetail,
        detail,
        detailLoading,
        detailError,
        updateProjectBody,
        saveProjectNow,
        addProject,
        saveProjectBodyForId,
        updateProjectStatusItem,
        hasPendingChanges,
        fetchList,
        reorderList,
    };
}

const ADD_MODAL_DEBOUNCE_MS = 500;

/**
 * 新規プロジェクト追加モーダル用: 500ms デバウンス・blur で DB へ反映（初回 insert、以降 update）。
 * knowledge 側は useAddKnowledgeDraftAutosave に同内容を複製。
 */
export function useAddProjectDraftAutosave(options: {
    isOpen: boolean;
    body: string;
    addRow: (body: string) => Promise<{ data: ProjectRow | null; error: Error | null }>;
    updateRow: (id: string, body: string) => Promise<boolean>;
    onAutosaveFailed?: () => void;
}) {
    const remoteIdRef = useRef<string | null>(null);
    const lastPersistedRef = useRef<string | null>(null);
    const [hasPendingChanges, setHasPendingChanges] = useState(false);
    const bodyRef = useRef(options.body);
    bodyRef.current = options.body;

    const addRowRef = useRef(options.addRow);
    addRowRef.current = options.addRow;
    const updateRowRef = useRef(options.updateRow);
    updateRowRef.current = options.updateRow;
    const onFailRef = useRef(options.onAutosaveFailed);
    onFailRef.current = options.onAutosaveFailed;

    const isOpenRef = useRef(options.isOpen);
    isOpenRef.current = options.isOpen;

    useEffect(() => {
        if (options.isOpen) {
            remoteIdRef.current = null;
            lastPersistedRef.current = null;
            setHasPendingChanges(false);
        }
    }, [options.isOpen]);

    const saveDraftNow = useCallback(async (): Promise<boolean> => {
        if (!isOpenRef.current) {
            setHasPendingChanges(false);
            return true;
        }
        const b = bodyRef.current;
        if (remoteIdRef.current) {
            if (lastPersistedRef.current === b) { setHasPendingChanges(false); return true; }
            const ok = await updateRowRef.current(remoteIdRef.current, b);
            if (ok) {
                lastPersistedRef.current = b;
                if (bodyRef.current === b) setHasPendingChanges(false);
            } else {
                onFailRef.current?.();
            }
            return ok;
        }
        if (b.trim() === '') { setHasPendingChanges(false); return true; }
        const { data, error } = await addRowRef.current(b);
        if (error || !data) {
            onFailRef.current?.();
            return false;
        }
        remoteIdRef.current = data.id;
        lastPersistedRef.current = b;
        if (bodyRef.current === b) setHasPendingChanges(false);
        return true;
    }, []);

    useEffect(() => {
        if (!options.isOpen) {
            setHasPendingChanges(false);
            return;
        }
        if (options.body !== lastPersistedRef.current && options.body.trim() !== '') {
            setHasPendingChanges(true);
        } else if (options.body.trim() === '') {
            setHasPendingChanges(false);
        }
        const t = setTimeout(() => {
            void saveDraftNow();
        }, ADD_MODAL_DEBOUNCE_MS);
        return () => clearTimeout(t);
    }, [options.body, options.isOpen, saveDraftNow]);

    const onBlur = useCallback(() => {
        void saveDraftNow();
    }, [saveDraftNow]);

    const hasPendingChangesRef = useRef(hasPendingChanges);
    hasPendingChangesRef.current = hasPendingChanges;

    useEffect(() => {
        const flushPendingDraftSave = () => {
            if (hasPendingChangesRef.current) {
                void saveDraftNow();
            }
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState !== 'hidden') return;
            flushPendingDraftSave();
        };
        const handlePageHide = () => {
            flushPendingDraftSave();
        };
        const handleFreeze = () => {
            flushPendingDraftSave();
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('pagehide', handlePageHide);
        window.addEventListener('freeze', handleFreeze);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('pagehide', handlePageHide);
            window.removeEventListener('freeze', handleFreeze);
            flushPendingDraftSave();
        };
    }, [saveDraftNow]);

    return { draftRemoteIdRef: remoteIdRef, saveDraftNow, onBlur, hasPendingChanges };
}
