'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { createClient } from '@/src/lib/supabase/client';
import {
    createTask,
    getTasksByStatus,
    type TaskStatus,
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
    unarchive_at: string | null;
};

const TASK_STATUSES: TaskStatus[] = ['waiting', 'completed', 'deleted', 'archived'];

// Supabaseの行データを画面用のTask型に正規化する。
function toTaskOrNull(row: TaskRow): Task | null {
    if (!TASK_STATUSES.includes(row.status as TaskStatus)) return null;
    return {
        id: row.id,
        task: row.task,
        status: row.status as TaskStatus,
        due_at: row.due_at,
        status_changed_at: row.status_changed_at,
        unarchive_at: row.unarchive_at,
    };
}

// ---------------------------------------------------------------------------
// タブ設定
// ---------------------------------------------------------------------------
const TABS: { status: TaskStatus; label: string }[] = [
    { status: 'waiting', label: '未完了' },
    { status: 'completed', label: '完了済み' },
    { status: 'deleted', label: '削除済み' },
    { status: 'archived', label: 'アーカイブ中' },
];

// ---------------------------------------------------------------------------
// メインページ
// ---------------------------------------------------------------------------
export default function TasksPage() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [activeTab, setActiveTab] = useState<TaskStatus>('waiting');
    const [isAdding, setIsAdding] = useState(false);
    const [mobileKeyboardOffset, setMobileKeyboardOffset] = useState(0);
    const [newTaskText, setNewTaskText] = useState('');
    const [newDueInput, setNewDueInput] = useState('');
    const [newDueInputError, setNewDueInputError] = useState('');
    const [archiveTargetId, setArchiveTargetId] = useState<string | null>(null);
    const [unarchiveAt, setUnarchiveAt] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [crudError, setCrudError] = useState('');

    const supabase = useMemo(createClient, []);
    const visibleTasks = tasks;
    const isDueInputValid = newDueInput.trim() === '' || parseDueInput(newDueInput.trim()) !== null;

    // 選択中タブのタスクを取得して一覧に反映する。
    useEffect(() => {
        let isSubscribed = true;
        setIsLoading(true);
        setCrudError('');

        void getTasksByStatus(supabase, activeTab).then(({ data, error }) => {
            if (!isSubscribed) return;
            if (error) {
                setCrudError('タスクの取得に失敗しました');
                setTasks([]);
                setIsLoading(false);
                return;
            }
            const normalizedTasks = (data ?? [])
                .map(toTaskOrNull)
                .filter((task): task is Task => task !== null);
            setTasks(normalizedTasks);
            setIsLoading(false);
        });

        return () => {
            isSubscribed = false;
        };
    }, [activeTab, supabase]);

    // モバイルでキーボードが開いた分だけ入力パネル位置を持ち上げる。
    useEffect(() => {
        if (!isAdding) {
            setMobileKeyboardOffset(0);
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
            setTasks((prev) => [createdTask, ...prev]);
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
        status: TaskStatus,
        nextUnarchiveAt?: string | null
    ): Promise<boolean> {
        const { error } = await updateTaskStatusQuery(supabase, id, status, nextUnarchiveAt);
        if (error) {
            setCrudError('タスクの更新に失敗しました');
            return false;
        }
        setTasks((prev) => prev.filter((t) => t.id !== id));
        setCrudError('');
        return true;
    }

    function completeTask(id: string) {
        void updateStatusAndRemoveFromList(id, 'completed');
    }

    // タスク本文をクリップボードへコピーする。成功時のみ true。
    async function copyTask(id: string): Promise<boolean> {
        const sourceTask = tasks.find((task) => task.id === id);
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

    // アーカイブ設定モーダルを開き、入力値を初期化する。
    function openArchiveDialog(id: string) {
        setArchiveTargetId(id);
        setUnarchiveAt('');
    }

    // アーカイブ確定時にステータスと解除日時を更新する。
    async function confirmArchive() {
        if (!archiveTargetId) return;
        const nextUnarchiveAt = unarchiveAt ? new Date(unarchiveAt).toISOString() : null;
        const isUpdated = await updateStatusAndRemoveFromList(
            archiveTargetId,
            'archived',
            nextUnarchiveAt
        );
        if (isUpdated) {
            setArchiveTargetId(null);
        }
    }

    // 完了/削除/アーカイブから未完了へ戻す。
    function moveTaskToWaiting(id: string) {
        void updateStatusAndRemoveFromList(id, 'waiting', null);
    }

    return (
        <div className="flex flex-col h-screen bg-neutral-100 dark:bg-neutral-950">
            {/* Header */}
            <header className="flex items-center justify-between px-2 sm:px-6 py-2 sm:py-2 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 shrink-0">
                <h1 className="text-base sm:text-lg font-medium leading-6 sm:leading-7 tracking-widest uppercase text-neutral-900 dark:text-neutral-100">
                    Tasks
                </h1>
                <div className="hidden sm:flex h-9 w-20 items-center justify-end">
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
                        <span aria-hidden="true" className="block h-9 w-20" />
                    )}
                </div>
            </header>

            {/* TabBar */}
            <div className="grid grid-cols-4 px-2 sm:px-6 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 shrink-0">
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
                        onClose={() => setIsAdding(false)}
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
                        onClose={() => setIsAdding(false)}
                    />
                )}

                {/* TaskList */}
                {crudError && (
                    <div className="px-2 sm:px-6 py-2 text-sm leading-6 text-amber-600 dark:text-amber-400">
                        {crudError}
                    </div>
                )}
                {isLoading ? (
                    <div className="flex items-center justify-center h-32 text-neutral-500 dark:text-neutral-500 text-sm">
                        読み込み中...
                    </div>
                ) : visibleTasks.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-neutral-500 dark:text-neutral-500 text-sm">
                        タスクはありません
                    </div>
                ) : (
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
                                onArchive={openArchiveDialog}
                                onDelete={deleteTask}
                                onMoveToWaiting={moveTaskToWaiting}
                            />
                        ))}
                    </ul>
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

            {/* ArchiveDialog */}
            {archiveTargetId && (
                // アーカイブ解除日時を設定するセンターモーダル。
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/50">
                    <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded p-2 sm:p-6 w-full max-w-sm sm:w-96 mx-2">
                        <h2 className="text-base sm:text-lg font-medium leading-6 sm:leading-7 text-neutral-900 dark:text-neutral-50 mb-4">
                            アーカイブ
                        </h2>
                        <p className="text-sm leading-6 text-neutral-700 dark:text-neutral-300 mb-4">
                            いつまでアーカイブしますか？（空欄の場合は無期限）
                        </p>
                        <input
                            type="datetime-local"
                            value={unarchiveAt}
                            onChange={(e) => setUnarchiveAt(e.target.value)}
                            className="w-full mb-4 sm:mb-6 px-3 py-2 text-sm rounded-sm outline-none transition-colors bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-50 focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 dark:focus:border-neutral-600 dark:focus:ring-neutral-600"
                        />
                        <div className="flex items-center justify-end gap-2">
                            <Button
                                color="ghost"
                                onClick={() => setArchiveTargetId(null)}
                            >
                                キャンセル
                            </Button>
                            <Button
                                color="primary"
                                onClick={() => void confirmArchive()}
                            >
                                確定
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
