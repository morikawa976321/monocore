'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/src/components/layout/PageHeader';
import { LoadingIndicator } from '@/src/components/ui/LoadingIndicator';
import { createClient } from '@/src/lib/supabase/client';
import {
    createTask,
    getTasksByStatus,
    type TaskStatus,
    updateTaskContent,
    updateTaskStatus as updateTaskStatusQuery,
} from '@/src/lib/supabase/queries/tasks';
import type { Database } from '@/src/types/database.types';
import { AddTaskForm } from '@/src/components/tasks/AddTaskForm';
import { TaskCard } from '@/src/components/tasks/TaskCard';
import { Button } from '@/src/components/ui/Button';
import { parseDueInput } from '@/src/lib/tasks/due-date';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------
type TaskRow = Database['public']['Tables']['tasks']['Row'];

type Task = {
    id: string;
    task: string;
    status: TaskStatus;
    due_at: string | null;
    status_changed_at: string | null;
};

const TASK_STATUSES: TaskStatus[] = ['waiting', 'completed', 'deleted'];

// Supabaseの行データを画面用のTask型に正規化する。
function toTaskOrNull(row: TaskRow): Task | null {
    if (!TASK_STATUSES.includes(row.status as TaskStatus)) return null;
    return {
        id: row.id,
        task: row.task,
        status: row.status as TaskStatus,
        due_at: row.due_at,
        status_changed_at: row.status_changed_at,
    };
}

// ---------------------------------------------------------------------------
// タブ設定
// ---------------------------------------------------------------------------
const TABS: { status: TaskStatus; label: string }[] = [
    { status: 'waiting', label: '未完了' },
    { status: 'completed', label: '完了済み' },
    { status: 'deleted', label: '削除済み' },
];

// ---------------------------------------------------------------------------
// メインページ
// ---------------------------------------------------------------------------
export default function TasksPage() {
    const [tasksByTab, setTasksByTab] = useState<Partial<Record<TaskStatus, Task[]>>>({});
    const [activeTab, setActiveTab] = useState<TaskStatus>('waiting');
    const [isAdding, setIsAdding] = useState(false);
    const [mobileKeyboardOffset, setMobileKeyboardOffset] = useState(0);
    const [newTaskText, setNewTaskText] = useState('');
    const [newDueInput, setNewDueInput] = useState('');
    const [newDueInputError, setNewDueInputError] = useState('');
    const [isInitialLoading, setIsInitialLoading] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [crudError, setCrudError] = useState('');
    const fetchSeqRef = useRef(0);
    const loadedTabsRef = useRef<Partial<Record<TaskStatus, boolean>>>({});

    const supabase = useMemo(() => createClient(), []);
    const visibleTasks = tasksByTab[activeTab] ?? [];
    const isDueInputValid = newDueInput.trim() === '' || parseDueInput(newDueInput.trim()) !== null;

    const updateTasksForTab = useCallback(
        (tab: TaskStatus, updater: (prev: Task[]) => Task[]) => {
            setTasksByTab((prev) => ({
                ...prev,
                [tab]: updater(prev[tab] ?? []),
            }));
        },
        []
    );

    const fetchTasksList = useCallback(() => {
        const fetchSeq = ++fetchSeqRef.current;
        let isSubscribed = true;
        const isInitial = !loadedTabsRef.current[activeTab];
        if (isInitial) {
            setIsInitialLoading(true);
        } else {
            setIsRefreshing(true);
        }
        setCrudError('');

        void (async () => {
            const { data, error } = await getTasksByStatus(supabase, activeTab);
            if (!isSubscribed) return;
            if (fetchSeqRef.current !== fetchSeq) return;
            if (error) {
                setCrudError('タスクの取得に失敗しました');
                if (isInitial) {
                    setTasksByTab((prev) => ({ ...prev, [activeTab]: [] }));
                }
                loadedTabsRef.current[activeTab] = true;
                setIsInitialLoading(false);
                setIsRefreshing(false);
                return;
            }
            const normalizedTasks = (data ?? [])
                .map(toTaskOrNull)
                .filter((task): task is Task => task !== null);
            loadedTabsRef.current[activeTab] = true;
            setTasksByTab((prev) => ({ ...prev, [activeTab]: normalizedTasks }));
            setIsInitialLoading(false);
            setIsRefreshing(false);
        })();

        return () => {
            isSubscribed = false;
        };
    }, [activeTab, supabase]);

    // 選択中タブのタスクを取得して一覧に反映する。さらにタブ復帰時（visible）にも自動最新化。
    useEffect(() => {
        let cleanup: (() => void) | undefined;
        const fetchTimer = window.setTimeout(() => {
            cleanup = fetchTasksList();
        }, 0);

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                void fetchTasksList();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.clearTimeout(fetchTimer);
            cleanup?.();
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [fetchTasksList]);

    // モバイルでキーボードが開いた分だけ入力パネル位置を持ち上げる。
    useEffect(() => {
        if (!isAdding) {
            return;
        }
        if (typeof window === 'undefined' || !window.visualViewport) return;

        const viewport = window.visualViewport;
        const updateMobileKeyboardOffset = () => {
            const keyboardHeight = Math.max(
                0,
                window.innerHeight - (viewport.height + viewport.offsetTop)
            );
            setMobileKeyboardOffset(keyboardHeight);
        };

        updateMobileKeyboardOffset();
        viewport.addEventListener('resize', updateMobileKeyboardOffset);
        viewport.addEventListener('scroll', updateMobileKeyboardOffset);

        return () => {
            viewport.removeEventListener('resize', updateMobileKeyboardOffset);
            viewport.removeEventListener('scroll', updateMobileKeyboardOffset);
        };
    }, [isAdding]);

    // --- アクション ---
    // 入力値を検証し、waitingタブの先頭に新規タスクを追加する。
    async function addTask() {
        const text = newTaskText.trim();
        if (!text) return;
        const dueText = newDueInput.trim();
        let parsedDue: Date | null = null;
        if (dueText) {
            parsedDue = parseDueInput(dueText);
            if (!parsedDue) {
                setNewDueInputError('締切形式が不正です（例: 202603182359, 20260318, 03182359, 0318）');
                return;
            }
        }

        const { data, error } = await createTask(
            supabase,
            text,
            parsedDue ? parsedDue.toISOString() : null
        );
        if (error || !data) {
            setCrudError('タスクの作成に失敗しました');
            return;
        }

        const createdTask = toTaskOrNull(data);
        if (!createdTask) {
            setCrudError('作成したタスクの形式が不正です');
            return;
        }

        if (activeTab === 'waiting') {
            updateTasksForTab('waiting', (prev) => {
                const newDue = createdTask.due_at;
                const insertIndex = prev.findIndex((t) => {
                    if (t.due_at === null) return true;
                    if (newDue === null) return false;
                    return t.due_at >= newDue;
                });
                const index = insertIndex === -1 ? prev.length : insertIndex;
                return [...prev.slice(0, index), createdTask, ...prev.slice(index)];
            });
        }
        setNewTaskText('');
        setNewDueInput('');
        setNewDueInputError('');
        setIsAdding(false);
        setCrudError('');
    }

    // ステータス更新後に現在一覧から対象タスクを除外する共通処理。
    async function updateStatusAndRemoveFromList(
        id: string,
        status: TaskStatus
    ): Promise<boolean> {
        const { error } = await updateTaskStatusQuery(supabase, id, status);
        if (error) {
            setCrudError('タスクの更新に失敗しました');
            return false;
        }
        setTasksByTab((prev) => ({
            ...prev,
            [activeTab]: (prev[activeTab] ?? []).filter((t) => t.id !== id),
        }));
        setCrudError('');
        return true;
    }

    function completeTask(id: string) {
        void updateStatusAndRemoveFromList(id, 'completed');
    }

    // タスク本文をクリップボードへコピーする。成功時のみ true。
    async function copyTask(id: string): Promise<boolean> {
        const sourceTask = visibleTasks.find((task) => task.id === id);
        if (!sourceTask) {
            setCrudError('コピー元タスクが見つかりません');
            return false;
        }
        try {
            await navigator.clipboard.writeText(sourceTask.task);
            setCrudError('');
            return true;
        } catch {
            setCrudError('クリップボードへのコピーに失敗しました');
            return false;
        }
    }

    function deleteTask(id: string) {
        void updateStatusAndRemoveFromList(id, 'deleted');
    }

    // 完了/削除から未完了へ戻す。
    function moveTaskToWaiting(id: string) {
        void updateStatusAndRemoveFromList(id, 'waiting');
    }

    // タスクの内容と締め切りを更新する。
    async function editTask(id: string, text: string, dueAt: string | null): Promise<boolean> {
        const { data, error } = await updateTaskContent(supabase, id, text, dueAt);
        if (error || !data) {
            setCrudError('タスクの更新に失敗しました');
            return false;
        }
        const updated = toTaskOrNull(data);
        if (!updated) {
            setCrudError('更新後のタスク形式が不正です');
            return false;
        }
        updateTasksForTab(activeTab, (prev) => prev.map((t) => (t.id === id ? updated : t)));
        setCrudError('');
        return true;
    }

    return (
        <div className="flex flex-col h-screen bg-neutral-100 dark:bg-neutral-950">
            {/* Header */}
            <PageHeader
                title="Tasks"
                onRefresh={() => void fetchTasksList()}
                isRefreshing={isRefreshing}
            >
                <div className="hidden sm:inline-flex justify-end">
                    {activeTab === 'waiting' ? (
                        <Button
                            color="primary"
                            onClick={() => setIsAdding((v) => !v)}
                            className="h-9"
                        >
                            <Plus className="w-4 h-4" />
                            Add
                        </Button>
                    ) : (
                        <span aria-hidden="true" className="block h-9 w-21.5" />
                    )}
                </div>
            </PageHeader>

            {/* TabBar */}
            <div className="grid grid-cols-3 px-2 sm:px-6 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 shrink-0">
                {TABS.map((tab) => (
                    <button
                        key={tab.status}
                        onClick={() => {
                            setActiveTab(tab.status);
                            setIsAdding(false);
                        }}
                        className={[
                            'w-full py-2 sm:py-4 text-sm font-medium border-b-2 transition-colors focus-visible:outline-none',
                            activeTab === tab.status
                                ? 'border-amber-500 text-neutral-900 dark:text-neutral-50'
                                : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300',
                        ].join(' ')}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto pb-12 sm:pb-0">
                {/* AddTaskForm */}
                {activeTab === 'waiting' && isAdding && (
                    // デスクトップ用追加フォーム。
                    <AddTaskForm
                        mode="desktop"
                        text={newTaskText}
                        dueInput={newDueInput}
                        dueInputError={newDueInputError}
                        isDueInputValid={isDueInputValid}
                        onTextChange={setNewTaskText}
                        onDueInputChange={(value) => {
                            setNewDueInput(value);
                            if (newDueInputError) setNewDueInputError('');
                        }}
                        onSubmit={() => void addTask()}
                        onClose={() => {
                            setNewTaskText('');
                            setNewDueInput('');
                            setNewDueInputError('');
                            setIsAdding(false);
                        }}
                    />
                )}
                {activeTab === 'waiting' && isAdding && (
                    // モバイル用追加フォーム（キーボードオフセット対応）。
                    <AddTaskForm
                        mode="mobile"
                        text={newTaskText}
                        dueInput={newDueInput}
                        dueInputError={newDueInputError}
                        isDueInputValid={isDueInputValid}
                        mobileKeyboardOffset={mobileKeyboardOffset}
                        onTextChange={setNewTaskText}
                        onDueInputChange={(value) => {
                            setNewDueInput(value);
                            if (newDueInputError) setNewDueInputError('');
                        }}
                        onSubmit={() => void addTask()}
                        onClose={() => {
                            setNewTaskText('');
                            setNewDueInput('');
                            setNewDueInputError('');
                            setIsAdding(false);
                        }}
                    />
                )}

                {/* TaskList */}
                {crudError && (
                    <div className="px-2 sm:px-6 py-2 text-sm leading-6 text-amber-600 dark:text-amber-400">
                        {crudError}
                    </div>
                )}
                {isInitialLoading ? (
                    <div className="flex items-center justify-center h-32">
                        <LoadingIndicator size="md" />
                    </div>
                ) : visibleTasks.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-neutral-500 dark:text-neutral-500 text-sm">
                        タスクはありません
                    </div>
                ) : (
                    <>
                        {isRefreshing && (
                            <p className="px-2 sm:px-6 py-2 text-sm text-neutral-700 dark:text-neutral-300">更新中…</p>
                        )}
                        <ul
                        className={[
                            'px-2 sm:px-2 pb-2 sm:pb-2 space-y-2 sm:space-y-2',
                            isAdding ? 'pt-2 sm:pt-0' : 'pt-2 sm:pt-2',
                        ].join(' ')}
                    >
                        {visibleTasks.map((task) => (
                            <TaskCard
                                key={task.id}
                                task={task}
                                onCopy={(id) => copyTask(id)}
                                onComplete={completeTask}
                                onDelete={deleteTask}
                                onMoveToWaiting={moveTaskToWaiting}
                                onEdit={editTask}
                            />
                        ))}
                    </ul>
                    </>
                )}
            </div>

            {activeTab === 'waiting' && (
                // モバイルの追加ボタン（固定表示）。
                <Button
                    color="primary"
                    onClick={() => setIsAdding((v) => !v)}
                    className="sm:hidden fixed right-4 bottom-4 z-10"
                >
                    <Plus className="w-4 h-4" />
                    Add
                </Button>
            )}

        </div>
    );
}
