import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/src/types/database.types';
import { getInbox, getInboxUpdatedAt, upsertInbox } from '@/src/lib/supabase/queries/inboxes';

type UseInboxReturn = {
    inboxOpen: boolean;
    setInboxOpen: Dispatch<SetStateAction<boolean>>;
    inboxContent: string;
    updateInboxContent: (value: string) => void;
    saveInboxNow: () => void;
    hasPendingChanges: boolean;
};

export function useInbox(supabase: SupabaseClient<Database>): UseInboxReturn {
    // UI上の開閉状態（DBとは無関係）。
    const [inboxOpen, setInboxOpen] = useState(false);
    // 画面に表示する現在の本文。
    const [inboxContent, setInboxContent] = useState('');
    // 「まだDBに保存し切れていない変更があるか」を示すフラグ。
    const [hasPendingChanges, setHasPendingChanges] = useState(false);
    // 入力のたびに保存しすぎないためのタイマーID。
    const inboxDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // 非同期処理中でも最新本文を参照できるようにするバッファ。
    const inboxContentRef = useRef('');
    // 画面の本文が DB のどの版か(updated_at)。タブに戻ったときはこれと DB の updated_at だけを比べ、
    // 違うときだけ本文を読み直す(本文は約 10KB あり、戻るたびに読むと通信がかさむ。2026-10-23)。
    const loadedUpdatedAtRef = useRef<string | null>(null);

    const persistInbox = useCallback(async () => {
        // state更新の遅延に依存しないよう、保存元は常にrefを参照する。
        const { updatedAt, error } = await upsertInbox(supabase, inboxContentRef.current);
        if (!error) {
            setHasPendingChanges(false);
            if (updatedAt) loadedUpdatedAtRef.current = updatedAt;
        }
    }, [supabase]);

    const clearInboxDebounce = useCallback(() => {
        if (!inboxDebounceRef.current) return;
        clearTimeout(inboxDebounceRef.current);
        inboxDebounceRef.current = null;
    }, []);

    useEffect(() => {
        // 初回表示時に既存のInboxを読み込み、UIと内部refを同じ値にそろえる。
        getInbox(supabase).then(({ data }) => {
            if (!data) return;
            setInboxContent(data.content);
            inboxContentRef.current = data.content;
            loadedUpdatedAtRef.current = data.updated_at;
            setHasPendingChanges(false);
        });
    }, [supabase]);

    useEffect(() => {
        // コンポーネント破棄時に未実行タイマーを掃除する。
        return () => {
            clearInboxDebounce();
        };
    }, [clearInboxDebounce]);

    const saveInboxNow = useCallback(() => {
        // 即時保存では予約保存を取り消して二重保存を避ける。
        clearInboxDebounce();
        void persistInbox();
    }, [clearInboxDebounce, persistInbox]);

    const updateInboxContent = useCallback(
        (value: string) => {
            // 入力はまずUIへ即反映。
            setInboxContent(value);
            // 直後に保存用refも更新して、保存時点の値ズレを防ぐ。
            inboxContentRef.current = value;
            // 入力直後は未保存フラグを立て、成功保存時にのみ解除する。
            setHasPendingChanges(true);

            // 連続入力では最後の入力から1秒後だけ保存する。
            clearInboxDebounce();
            inboxDebounceRef.current = setTimeout(() => {
                inboxDebounceRef.current = null;
                void persistInbox();
            }, 500);
        },
        [clearInboxDebounce, persistInbox]
    );

    const hasPendingChangesRef = useRef(hasPendingChanges);
    const resumeFetchSeqRef = useRef(0);

    useEffect(() => {
        hasPendingChangesRef.current = hasPendingChanges;
    }, [hasPendingChanges]);

    useEffect(() => {
        // タブが隠れる/閉じる/フリーズする瞬間に保留中の保存を問答無用で流す。
        // 「全選択して消す → 貼り直す前にアプリがバックグラウンドへ回る」と空の content が
        // そのまま確定する経路がここにある(2026-08-29 に inboxes.content が空で上書きされた
        // 件の最有力原因。未修正)。inbox_revisions が直前の値を退避するので事後には遡れるが、
        // 空保存自体は防いでいない。直す場合の候補は「保存直前に内容が大きく縮むなら確認を挟む」。
        const flushPendingInboxSave = () => {
            if (inboxDebounceRef.current == null) return;
            saveInboxNow();
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                flushPendingInboxSave();
            } else if (document.visibilityState === 'visible') {
                if (hasPendingChangesRef.current) return;
                const fetchSeq = ++resumeFetchSeqRef.current;
                // フォーカス復帰時に未保存のものがなければ、DB の版が変わっていたときだけ本文を読み直す。
                void (async () => {
                    const stamp = await getInboxUpdatedAt(supabase);
                    if (resumeFetchSeqRef.current !== fetchSeq) return;
                    if (stamp.error || !stamp.data || stamp.data === loadedUpdatedAtRef.current) return;
                    const { data } = await getInbox(supabase);
                    if (resumeFetchSeqRef.current !== fetchSeq) return;
                    if (hasPendingChangesRef.current) return;
                    if (!data) return;
                    setInboxContent(data.content);
                    inboxContentRef.current = data.content;
                    loadedUpdatedAtRef.current = data.updated_at;
                    setHasPendingChanges(false);
                })();
            }
        };
        const handlePageHide = () => {
            flushPendingInboxSave();
        };
        const handleFreeze = () => {
            flushPendingInboxSave();
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('pagehide', handlePageHide);
        window.addEventListener('freeze', handleFreeze);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('pagehide', handlePageHide);
            window.removeEventListener('freeze', handleFreeze);
        };
    }, [saveInboxNow, supabase]);

    return {
        inboxOpen,
        setInboxOpen,
        inboxContent,
        updateInboxContent,
        saveInboxNow,
        hasPendingChanges,
    };
}
