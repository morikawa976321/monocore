/**
 * ナレッジ一覧・詳細編集のクライアント状態。
 * 一覧は body なし、詳細オープン時のみ getKnowledgeById。本文変更はデバウンス保存（useProjects / useInbox と同様）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/src/types/database.types';
import {
    createKnowledge as insertKnowledge,
    deleteKnowledge,
    getKnowledgeById,
    listKnowledge,
    updateKnowledge,
    type KnowledgeListRow,
} from '@/src/lib/supabase/queries/knowledge';

type KnowledgeRow = Database['public']['Tables']['knowledge']['Row'];

type UseKnowledgeReturn = {
    list: KnowledgeListRow[];
    listLoading: boolean;
    listError: Error | null;
    selectedId: string | null;
    setSelectedId: (id: string | null) => void;
    /** 未送信の本文を保存してから詳細を閉じる（失敗時はモーダルを開いたまま）。 */
    closeDetail: () => Promise<void>;
    detail: KnowledgeRow | null;
    detailLoading: boolean;
    detailError: Error | null;
    updateKnowledgeBody: (value: string) => void;
    saveKnowledgeNow: () => void;
    addKnowledge: (body: string) => Promise<{ data: KnowledgeRow | null; error: Error | null }>;
    saveKnowledgeBodyForId: (id: string, body: string) => Promise<boolean>;
    deleteKnowledgeItem: (id: string) => Promise<boolean>;
    hasPendingChanges: boolean;
    fetchList: () => Promise<void>;
};

/** 連続入力時の DB 更新間隔（ms）。 */
const SAVE_DEBOUNCE_MS = 500;

export function useKnowledge(supabase: SupabaseClient<Database>): UseKnowledgeReturn {
    const [list, setList] = useState<KnowledgeListRow[]>([]);
    const [listLoading, setListLoading] = useState(true);
    const [listError, setListError] = useState<Error | null>(null);

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [detail, setDetail] = useState<KnowledgeRow | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState<Error | null>(null);
    const [hasPendingChanges, setHasPendingChanges] = useState(false);
    const hasPendingChangesRef = useRef(hasPendingChanges);
    hasPendingChangesRef.current = hasPendingChanges;

    /** 保存・effect cleanup 用の最新本文（state より先に確実に読む）。 */
    const bodyRef = useRef('');
    /** getKnowledgeById が完了し、編集してよい行か判定する。 */
    const lastLoadedIdRef = useRef<string | null>(null);
    /** 非同期 update 完了時、もう別行を見ていれば detail を上書きしない。 */
    const selectedIdRef = useRef<string | null>(null);
    const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    selectedIdRef.current = selectedId;

    const clearSaveDebounce = useCallback(() => {
        if (!saveDebounceRef.current) return;
        clearTimeout(saveDebounceRef.current);
        saveDebounceRef.current = null;
    }, []);

    const persistKnowledge = useCallback(
        async (id: string, body: string): Promise<boolean> => {
            const { data, error } = await updateKnowledge(supabase, id, body);
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

    const saveKnowledgeNow = useCallback(() => {
        clearSaveDebounce();
        const id = selectedId;
        if (!id || lastLoadedIdRef.current !== id) return;
        void persistKnowledge(id, bodyRef.current);
    }, [clearSaveDebounce, persistKnowledge, selectedId]);

    const fetchList = useCallback(async () => {
        setListLoading(true);
        setListError(null);
        // body は取らず、更新日時の新しい順（クエリ側の仕様）
        const { data, error } = await listKnowledge(supabase);
        if (error) {
            setListError(error);
            setList([]);
        } else {
            setList(data ?? []);
        }
        setListLoading(false);
    }, [supabase]);

    useEffect(() => {
        let isCancelled = false;
        void fetchList().then(() => {
            if (isCancelled) return;
        });
        return () => {
            isCancelled = true;
        };
    }, [fetchList]);

    // 選択 ID に応じて詳細を読み込む。別行へ移動時はクリーンアップで未デバウンス分を保存。閉じるは closeDetail が await 保存済みのためクリーンアップでは二重保存されない。
    useEffect(() => {
        if (!selectedId) {
            lastLoadedIdRef.current = null;
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
        setDetail(null);
        lastLoadedIdRef.current = null;
        bodyRef.current = '';

        void getKnowledgeById(supabase, selectedId).then(({ data, error }) => {
            if (cancelled) return;
            if (error) {
                setDetailError(error);
                setDetail(null);
                setHasPendingChanges(false);
            } else if (data) {
                setDetail(data);
                bodyRef.current = data.body;
                lastLoadedIdRef.current = data.id;
                setHasPendingChanges(false);
            }
            setDetailLoading(false);
        });

        return () => {
            cancelled = true;
            clearSaveDebounce();
            const idToFlush = selectedId;
            if (lastLoadedIdRef.current === idToFlush) {
                void persistKnowledge(idToFlush, bodyRef.current);
            }
            lastLoadedIdRef.current = null;
        };
    }, [clearSaveDebounce, persistKnowledge, selectedId, supabase]);

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
            saveKnowledgeNow();
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                flushPendingSave();
            } else if (document.visibilityState === 'visible') {
                // 入力途中で未保存の変更がある場合は、上書きを防ぐためリロードしない
                if (hasPendingChangesRef.current) return;

                void fetchList();

                const currentSelectedId = selectedIdRef.current;
                if (currentSelectedId) {
                    setDetailLoading(true);
                    setDetailError(null);
                    void getKnowledgeById(supabase, currentSelectedId).then(({ data, error }) => {
                        // ロード中に選択行が変わっていたら無視
                        if (selectedIdRef.current !== currentSelectedId) return;
                        if (hasPendingChangesRef.current) return;

                        if (error) {
                            setDetailError(error);
                            setDetail(null);
                            setHasPendingChanges(false);
                        } else if (data) {
                            setDetail(data);
                            bodyRef.current = data.body;
                            lastLoadedIdRef.current = data.id;
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
    }, [saveKnowledgeNow, fetchList, supabase]);

    const updateKnowledgeBody = useCallback(
        (value: string) => {
            const id = selectedId;
            // 取得完了前の入力は無視
            if (!id || lastLoadedIdRef.current !== id) return;
            setDetail((prev) => (prev ? { ...prev, body: value } : null));
            bodyRef.current = value;
            setHasPendingChanges(true);

            clearSaveDebounce();
            saveDebounceRef.current = setTimeout(() => {
                saveDebounceRef.current = null;
                void persistKnowledge(id, bodyRef.current);
            }, SAVE_DEBOUNCE_MS);
        },
        [clearSaveDebounce, persistKnowledge, selectedId]
    );

    /**
     * 閉じる操作はすべてここに集約。先に未送信本文を保存し、成功後に選択解除。
     * lastLoadedIdRef を先に無効化し、selectedId を null にしたときの effect クリーンアップと二重保存しない。
     */
    const closeDetail = useCallback(async () => {
        clearSaveDebounce();
        const id = selectedId;
        if (id && lastLoadedIdRef.current === id) {
            const ok = await persistKnowledge(id, bodyRef.current);
            if (!ok) return;
        }
        lastLoadedIdRef.current = null;
        setHasPendingChanges(false);
        setSelectedId(null);
    }, [clearSaveDebounce, persistKnowledge, selectedId]);

    /** ページの「新規追加」モーダルから呼ぶ。成功時は一覧先頭に差し込む。 */
    const addKnowledge = useCallback(
        async (body: string) => {
            const { data, error } = await insertKnowledge(supabase, body);
            if (error || !data) {
                return { data: null, error: error ?? new Error('create failed') };
            }
            const listRow: KnowledgeListRow = {
                id: data.id,
                title: data.title,
                created_at: data.created_at,
                updated_at: data.updated_at,
            };
            setList((prev) => [listRow, ...prev]);
            return { data, error: null };
        },
        [supabase]
    );

    const saveKnowledgeBodyForId = useCallback(
        async (id: string, body: string) => persistKnowledge(id, body),
        [persistKnowledge]
    );

    const deleteKnowledgeItem = useCallback(
        async (id: string) => {
            const { error } = await deleteKnowledge(supabase, id);
            if (error) return false;
            setList((prev) => prev.filter((row) => row.id !== id));
            return true;
        },
        [supabase]
    );

    return {
        list,
        listLoading,
        listError,
        selectedId,
        setSelectedId,
        closeDetail,
        detail,
        detailLoading,
        detailError,
        updateKnowledgeBody,
        saveKnowledgeNow,
        addKnowledge,
        saveKnowledgeBodyForId,
        deleteKnowledgeItem,
        hasPendingChanges,
        fetchList,
    };
}

const ADD_MODAL_DEBOUNCE_MS = 500;

/**
 * 新規ナレッジ追加モーダル用: 500ms デバウンス・blur で DB へ反映（初回 insert、以降 update）。
 * projects 側は useAddProjectDraftAutosave に同内容を複製。
 */
export function useAddKnowledgeDraftAutosave(options: {
    isOpen: boolean;
    body: string;
    addRow: (body: string) => Promise<{ data: KnowledgeRow | null; error: Error | null }>;
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
