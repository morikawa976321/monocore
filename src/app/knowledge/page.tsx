'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { createClient } from '@/src/lib/supabase/client';
import { useAddKnowledgeDraftAutosave, useKnowledge } from '@/src/hooks/useKnowledge';

/** 新規モーダル初期表示。未編集で閉じた場合は作成しない（initialAddBodyRef と比較）。 */
const DEFAULT_NEW_KNOWLEDGE_BODY = '# ';

/** 親スクロール領域内で「今見えている帯」に合わせる。モバイルの visualViewport（キーボード）対応。 */
function overlayBoxInParent(parent: HTMLElement): { top: number; height: number } {
    const rect = parent.getBoundingClientRect();
    const viewport = window.visualViewport;
    if (!viewport) return { top: 0, height: parent.clientHeight };
    const visibleTop = Math.max(rect.top, viewport.offsetTop);
    const visibleBottom = Math.min(rect.bottom, viewport.offsetTop + viewport.height);
    return { top: visibleTop - rect.top, height: Math.max(0, visibleBottom - visibleTop) };
}

export default function KnowledgePage() {
    const supabase = useMemo(createClient, []);
    const {
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
        addKnowledge,
        saveKnowledgeBodyForId,
        deleteKnowledgeItem,
        hasPendingChanges: detailHasPendingChanges,
    } = useKnowledge(supabase);

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newKnowledgeBody, setNewKnowledgeBody] = useState(DEFAULT_NEW_KNOWLEDGE_BODY);
    const [createError, setCreateError] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    /** 追加モーダルを開いた瞬間の本文。これと同一のまま閉じたら「未記入」とみなして DB に作らない。 */
    const initialAddBodyRef = useRef(DEFAULT_NEW_KNOWLEDGE_BODY);

    const { draftRemoteIdRef, saveDraftNow, onBlur: onAddDraftBlur, hasPendingChanges: draftHasPendingChanges } = useAddKnowledgeDraftAutosave({
        isOpen: isAddModalOpen,
        body: newKnowledgeBody,
        addRow: addKnowledge,
        updateRow: saveKnowledgeBodyForId,
        onAutosaveFailed: () => setCreateError('自動保存に失敗しました'),
    });

    const hasAnyPendingChanges = detailHasPendingChanges || draftHasPendingChanges;
    const hasAnyPendingChangesRef = useRef(hasAnyPendingChanges);
    hasAnyPendingChangesRef.current = hasAnyPendingChanges;

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (!hasAnyPendingChangesRef.current) return;
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, []);

    const overlayHostRef = useRef<HTMLDivElement>(null);
    const [overlayBox, setOverlayBox] = useState<{ top: number; height: number } | null>(null);

    const selectedOpen = selectedId !== null;
    /** 詳細または追加のどちらかが開いている間、背面固定・オーバーレイ計算を有効にする。 */
    const overlayOpen = selectedOpen || isAddModalOpen;

    const shouldDiscardNewKnowledgeDraft = useCallback(() => {
        if (newKnowledgeBody.trim() === '') return true; // 空・空白のみ
        if (newKnowledgeBody === initialAddBodyRef.current) return true; // 開いた直後から一字も変えていない
        return false;
    }, [newKnowledgeBody]);

    /**
     * 追加モーダルを閉じる経路はすべてここに集約（閉じる・Esc・背景・Add トグル・一覧で別行を選ぶ）。
     * 破棄時は自動保存で作成済みの行があれば論理削除。確定時は saveDraftNow 後に最終行を開く。
     * afterCloseSelectId: 一覧クリックで「保存後に開く行」を指定（新規の id ではなくクリック先）。
     */
    const finalizeAddModal = useCallback(
        async (options?: { afterCloseSelectId?: string | null }) => {
            if (!isAddModalOpen) return;
            if (shouldDiscardNewKnowledgeDraft()) {
                const draftId = draftRemoteIdRef.current;
                if (draftId) {
                    const deleted = await deleteKnowledgeItem(draftId);
                    if (!deleted) {
                        setCreateError('下書きの削除に失敗しました');
                        return;
                    }
                }
                setIsAddModalOpen(false);
                setCreateError(null);
                if (options?.afterCloseSelectId != null) {
                    setSelectedId(options.afterCloseSelectId);
                }
                return;
            }
            setIsCreating(true);
            setCreateError(null);
            try {
                const ok = await saveDraftNow();
                if (!ok) {
                    setCreateError('保存に失敗しました');
                    return;
                }
                let targetId = draftRemoteIdRef.current;
                if (!targetId) {
                    const body =
                        newKnowledgeBody.trim() === '' ? DEFAULT_NEW_KNOWLEDGE_BODY : newKnowledgeBody;
                    const { data, error } = await addKnowledge(body);
                    if (error) {
                        setCreateError(error.message);
                        return;
                    }
                    targetId = data?.id ?? null;
                }
                if (!targetId) return;
                setIsAddModalOpen(false);
                setCreateError(null);
                if (options?.afterCloseSelectId != null) {
                    setSelectedId(options.afterCloseSelectId);
                } else {
                    setSelectedId(targetId);
                }
            } finally {
                setIsCreating(false);
            }
        },
        [
            addKnowledge,
            deleteKnowledgeItem,
            draftRemoteIdRef,
            isAddModalOpen,
            newKnowledgeBody,
            saveDraftNow,
            shouldDiscardNewKnowledgeDraft,
        ]
    );

    /** 開くときは詳細を保存して閉じてから初期本文を入れる。閉じるときは finalizeAddModal（保存または破棄）。 */
    const toggleAddModal = useCallback(() => {
        if (isAddModalOpen) {
            void finalizeAddModal();
            return;
        }
        void (async () => {
            await closeDetail();
            setCreateError(null);
            initialAddBodyRef.current = DEFAULT_NEW_KNOWLEDGE_BODY;
            setNewKnowledgeBody(DEFAULT_NEW_KNOWLEDGE_BODY);
            setIsAddModalOpen(true);
        })();
    }, [closeDetail, finalizeAddModal, isAddModalOpen]);

    const updateOverlayBox = useCallback(() => {
        if (!overlayOpen) return;
        const parent = overlayHostRef.current?.parentElement;
        if (parent) setOverlayBox(overlayBoxInParent(parent));
    }, [overlayOpen]);

    // ダイアログ枠の top/height を親の可視領域に合わせる（viewport 変化・親リサイズ）。
    useLayoutEffect(() => {
        if (!overlayOpen) return;
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
    }, [overlayOpen, updateOverlayBox]);

    // iOS 等でモーダル表示中に背面がスクロールしないよう body を固定し、解除時に scroll 位置を戻す。
    useLayoutEffect(() => {
        if (!overlayOpen) return;
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
    }, [overlayOpen]);

    useEffect(() => {
        if (!overlayOpen) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            // 追加中は finalizeAddModal。詳細は closeDetail（保存成功後に閉じる）。
            if (isAddModalOpen) void finalizeAddModal();
            else void closeDetail();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [closeDetail, finalizeAddModal, isAddModalOpen, overlayOpen]);

    function handleBackdropClick() {
        if (isAddModalOpen) void finalizeAddModal();
        else void closeDetail();
    }

    return (
        <div className="flex flex-col h-screen bg-neutral-100 dark:bg-neutral-950">
            <header className="flex items-center justify-between px-2 sm:px-6 py-2 sm:py-2 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 shrink-0">
                <h1 className="text-base sm:text-lg font-medium leading-6 sm:leading-7 tracking-widest uppercase text-neutral-900 dark:text-neutral-100">
                    Knowledge
                </h1>
                <div className="hidden sm:flex h-9 w-20 items-center justify-end">
                    <Button color="primary" onClick={() => toggleAddModal()} className="h-9">
                        <Plus className="w-4 h-4" />
                        Add
                    </Button>
                </div>
            </header>

            <div className="relative flex-1 overflow-hidden">
                <div className="h-full overflow-y-auto px-2 sm:px-6 pt-4 sm:pt-6 pb-12 sm:pb-6">
                    {listError && (
                        <p className="mb-4 text-sm text-neutral-800 dark:text-neutral-200" role="alert">
                            {listError.message}
                        </p>
                    )}
                    {listLoading ? (
                        <p className="text-sm text-neutral-700 dark:text-neutral-300">読み込み中…</p>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-2">
                            {list.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    title={item.title}
                                    onClick={() => {
                                        if (isAddModalOpen) {
                                            void finalizeAddModal({ afterCloseSelectId: item.id });
                                        } else {
                                            setSelectedId(item.id);
                                        }
                                    }}
                                    className="min-w-0 w-full rounded border border-neutral-400 bg-neutral-50 p-1 text-left transition-colors duration-150 ease-in-out hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:hover:bg-neutral-800 dark:focus-visible:ring-neutral-50 sm:p-2"
                                >
                                    <p className="truncate text-sm leading-6 text-neutral-900 dark:text-neutral-50 sm:text-base sm:leading-7">
                                        {item.title}
                                    </p>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {overlayOpen && (
                    <>
                        <div
                            className="absolute inset-0 z-40 bg-neutral-950/50"
                            onClick={() => handleBackdropClick()}
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
                            {isAddModalOpen ? (
                                <aside
                                    role="dialog"
                                    aria-modal="true"
                                    aria-label="新規ナレッジ"
                                    className="pointer-events-auto flex h-full min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded border-2 border-neutral-400 bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-900"
                                >
                                    <div className="flex min-h-0 flex-1 flex-col p-4">
                                        {createError && (
                                            <p className="mb-2 text-sm text-neutral-800 dark:text-neutral-200" role="alert">
                                                {createError}
                                            </p>
                                        )}
                                        <textarea
                                            value={newKnowledgeBody}
                                            onChange={(e) => setNewKnowledgeBody(e.target.value)}
                                            onBlur={onAddDraftBlur}
                                            className="min-h-0 w-full flex-1 resize-none overflow-y-auto bg-transparent text-sm leading-6 sm:text-base sm:leading-7 text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-neutral-100 dark:placeholder:text-neutral-600"
                                            spellCheck={false}
                                            autoComplete="off"
                                            autoCorrect="off"
                                            disabled={isCreating}
                                        />
                                    </div>
                                    <div className="flex shrink-0 justify-end border-t border-neutral-200 px-2 py-2 dark:border-neutral-800">
                                        <Button
                                            type="button"
                                            color="secondary"
                                            size="md"
                                            onClick={() => void finalizeAddModal()}
                                            disabled={isCreating}
                                            aria-label="新規ナレッジを保存して閉じる"
                                        >
                                            閉じる
                                        </Button>
                                    </div>
                                </aside>
                            ) : (
                                <aside
                                    role="dialog"
                                    aria-modal="true"
                                    aria-label="Knowledge detail"
                                    className="pointer-events-auto flex h-full min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded border-2 border-neutral-400 bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-900"
                                >
                                    <div className="flex min-h-0 flex-1 flex-col p-4">
                                        {detailError && (
                                            <p className="mb-2 text-sm text-neutral-800 dark:text-neutral-200" role="alert">
                                                {detailError.message}
                                            </p>
                                        )}
                                        {detailLoading ? (
                                            <p className="text-sm text-neutral-700 dark:text-neutral-300">読み込み中…</p>
                                        ) : detail ? (
                                            <textarea
                                                value={detail.body}
                                                onChange={(e) => updateKnowledgeBody(e.target.value)}
                                                className="min-h-0 w-full flex-1 resize-none overflow-y-auto bg-transparent text-sm leading-6 sm:text-base sm:leading-7 text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-neutral-100 dark:placeholder:text-neutral-600"
                                                spellCheck={false}
                                                autoComplete="off"
                                                autoCorrect="off"
                                            />
                                        ) : null}
                                    </div>
                                    <div className="flex shrink-0 justify-end border-t border-neutral-200 px-2 py-2 dark:border-neutral-800">
                                        <Button
                                            type="button"
                                            color="secondary"
                                            size="md"
                                            onClick={() => void closeDetail()}
                                            aria-label="Knowledge詳細を閉じる"
                                        >
                                            閉じる
                                        </Button>
                                    </div>
                                </aside>
                            )}
                        </div>
                    </>
                )}
            </div>

            <Button color="primary" onClick={() => toggleAddModal()} className="sm:hidden fixed right-4 bottom-4 z-10">
                <Plus className="w-4 h-4" />
                Add
            </Button>
        </div>
    );
}
