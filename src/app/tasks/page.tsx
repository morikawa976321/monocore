'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {Check, Archive, Copy, Trash2, Plus, X} from 'lucide-react';
import { createClient } from '@/src/lib/supabase/client';
import {createTask,
    getTasksByStatus,
    type TaskStatus,
    updateTaskStatus as updateTaskStatusQuery,
} from '@/src/lib/supabase/queries/tasks';
import type { Database } from '@/src/types/database.types';

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
// 日時フォーマットユーティリティ
// ---------------------------------------------------------------------------
function formatDate(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
}

function formatDateOnly(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}/${mm}/${dd}`;
}

function createDateOrNull(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number
): Date | null {
    const date = new Date(year, month - 1, day, hour, minute, 0, 0);
    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day ||
        date.getHours() !== hour ||
        date.getMinutes() !== minute
    ) {
        return null;
    }
    return date;
}

function resolveNearestFutureYear(month: number, day: number, hour: number, minute: number): number {
    const now = new Date();
    const baseYear = now.getFullYear();
    for (let offset = 0; offset <= 8; offset += 1) {
        const year = baseYear + offset;
        const candidate = createDateOrNull(year, month, day, hour, minute);
        if (!candidate) continue;
        if (candidate.getTime() >= now.getTime()) return year;
    }
    return baseYear;
}

function parseDueInput(raw: string): Date | null {
    const digits = raw.replace(/\D/g, '');
    if (!digits) return null;

    // YYYYMMDDHHMM
    if (digits.length === 12) {
        const year = Number(digits.slice(0, 4));
        const month = Number(digits.slice(4, 6));
        const day = Number(digits.slice(6, 8));
        const hour = Number(digits.slice(8, 10));
        const minute = Number(digits.slice(10, 12));
        return createDateOrNull(year, month, day, hour, minute);
    }

    // YYYYMMDD または MMDDHHMM
    if (digits.length === 8) {
        const head = Number(digits.slice(0, 4));
        const tailA = Number(digits.slice(4, 6));
        const tailB = Number(digits.slice(6, 8));

        // YYYYMMDD: HHMM は 2359 を補完
        if (head >= 1900) {
            const year = head;
            const month = tailA;
            const day = tailB;
            return createDateOrNull(year, month, day, 23, 59);
        }

        // MMDDHHMM: YYYY は最も近い未来年を補完
        const month = Number(digits.slice(0, 2));
        const day = Number(digits.slice(2, 4));
        const hour = Number(digits.slice(4, 6));
        const minute = Number(digits.slice(6, 8));
        const year = resolveNearestFutureYear(month, day, hour, minute);
        return createDateOrNull(year, month, day, hour, minute);
    }

    // MMDD: HHMM は 2359, YYYY は最も近い未来年を補完
    if (digits.length === 4) {
        const month = Number(digits.slice(0, 2));
        const day = Number(digits.slice(2, 4));
        const year = resolveNearestFutureYear(month, day, 23, 59);
        return createDateOrNull(year, month, day, 23, 59);
    }

    return null;
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
    const desktopTaskTextareaRef = useRef<HTMLTextAreaElement | null>(null);
    const mobileTaskTextareaRef = useRef<HTMLTextAreaElement | null>(null);

    const supabase = useMemo(createClient, []);
    const visibleTasks = tasks;
    const isDueInputValid = newDueInput.trim() === '' || parseDueInput(newDueInput.trim()) !== null;

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

    useEffect(() => {
        if (!isAdding) return;
        if (desktopTaskTextareaRef.current) {
            resizeNewTaskTextarea(desktopTaskTextareaRef.current);
        }
        if (mobileTaskTextareaRef.current) {
            resizeNewTaskTextarea(mobileTaskTextareaRef.current);
        }
    }, [isAdding, newTaskText]);

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

    async function copyTask(id: string) {
        const sourceTask = tasks.find((task) => task.id === id);
        if (!sourceTask) {
            setCrudError('コピー元タスクが見つかりません');
            return;
        }
        try {
            await navigator.clipboard.writeText(sourceTask.task);
            setCrudError('');
        } catch {
            setCrudError('クリップボードへのコピーに失敗しました');
        }
    }

    function deleteTask(id: string) {
        void updateStatusAndRemoveFromList(id, 'deleted');
    }

    function openArchiveDialog(id: string) {
        setArchiveTargetId(id);
        setUnarchiveAt('');
    }

    function resizeNewTaskTextarea(target: HTMLTextAreaElement) {
        target.style.height = 'auto';
        target.style.height = `${target.scrollHeight}px`;
    }

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

    function moveTaskToWaiting(id: string) {
        void updateStatusAndRemoveFromList(id, 'waiting', null);
    }

    return (
        <div className="flex flex-col h-screen bg-neutral-100 dark:bg-neutral-950">
            {/* Header */}
            <header className="flex items-center justify-between px-2 sm:px-6 py-2 sm:py-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 shrink-0">
                <h1 className="text-base sm:text-lg font-medium leading-6 sm:leading-7 tracking-widest uppercase text-neutral-900 dark:text-neutral-100">
                    Tasks
                </h1>
                <div className="hidden sm:flex h-9 w-20 items-center justify-end">
                    {activeTab === 'waiting' ? (
                        <button
                            onClick={() => setIsAdding((v) => !v)}
                            className="flex items-center gap-1 px-4 py-2 text-sm font-medium rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500 dark:focus-visible:ring-amber-400 bg-amber-500 text-neutral-50 hover:bg-amber-600 dark:bg-amber-500 dark:text-neutral-950 dark:hover:bg-amber-400"
                        >
                            <Plus className="w-4 h-4" />
                            Add
                        </button>
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
                    <div className="hidden sm:block px-2 sm:px-4 py-2 sm:py-4 mb-2 sm:mb-0">
                        <div className="rounded border border-neutral-400 dark:border-neutral-600 p-2 sm:p-4">
                            <div className="flex items-start gap-2 sm:gap-4">
                                <textarea
                                    ref={desktopTaskTextareaRef}
                                    value={newTaskText}
                                    onChange={(e) => {
                                        setNewTaskText(e.target.value);
                                        resizeNewTaskTextarea(e.currentTarget);
                                    }}
                                    onKeyDown={(e) => {
                                        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                                            void addTask();
                                        }
                                        if (e.key === 'Escape') setIsAdding(false);
                                    }}
                                    placeholder="タスクの内容"
                                    autoFocus
                                    rows={1}
                                    className="flex-1 px-3 py-2 text-sm rounded-sm outline-none transition-colors bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 dark:focus:border-neutral-600 dark:focus:ring-neutral-600 min-h-10 resize-none overflow-hidden"
                                />
                                <input
                                    type="text"
                                    value={newDueInput}
                                    onChange={(e) => {
                                        setNewDueInput(e.target.value);
                                        if (newDueInputError) setNewDueInputError('');
                                    }}
                                    inputMode="numeric"
                                    placeholder="締切"
                                    className="px-3 py-2 text-sm rounded-sm outline-none transition-colors bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-50 focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 dark:focus:border-neutral-600 dark:focus:ring-neutral-600"
                                />
                                <button
                                    onClick={() => void addTask()}
                                    disabled={!newTaskText.trim() || !isDueInputValid}
                                    className="px-4 py-2 text-sm font-medium rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500 dark:focus-visible:ring-amber-400 bg-amber-500 text-neutral-50 hover:bg-amber-600 dark:bg-amber-500 dark:text-neutral-950 dark:hover:bg-amber-400 disabled:opacity-40"
                                >
                                    Add
                                </button>
                                <button
                                    onClick={() => setIsAdding(false)}
                                    className="p-2 text-sm font-medium rounded-sm transition-colors text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            {newDueInputError && (
                                <p className="mt-2 text-sm leading-6 text-amber-600 dark:text-amber-400">
                                    {newDueInputError}
                                </p>
                            )}
                        </div>
                    </div>
                )}
                {activeTab === 'waiting' && isAdding && (
                    <div className="sm:hidden fixed inset-0 z-40">
                        <button
                            aria-label="追加パネルを閉じる"
                            onClick={() => setIsAdding(false)}
                            className="absolute inset-0 bg-neutral-950/50"
                        />
                        <div
                            className="absolute inset-0 z-50 flex items-end justify-center p-2"
                            style={{
                                paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${mobileKeyboardOffset}px + 0.5rem)`,
                            }}
                            onClick={() => setIsAdding(false)}
                        >
                            <div
                                className="w-full max-w-sm rounded border border-neutral-400 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-900 p-2"
                                onClick={(e) => e.stopPropagation()}
                            >
                            <div className="flex items-start gap-2">
                                <textarea
                                    ref={mobileTaskTextareaRef}
                                    value={newTaskText}
                                    onChange={(e) => {
                                        setNewTaskText(e.target.value);
                                        resizeNewTaskTextarea(e.currentTarget);
                                    }}
                                    onKeyDown={(e) => {
                                        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                                            void addTask();
                                        }
                                        if (e.key === 'Escape') setIsAdding(false);
                                    }}
                                    placeholder="タスクの内容"
                                    autoFocus
                                    rows={1}
                                    className="flex-1 px-3 py-2 text-sm rounded-sm outline-none transition-colors bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 dark:focus:border-neutral-600 dark:focus:ring-neutral-600 min-h-10 resize-none overflow-hidden"
                                />
                            </div>
                            <div className="mt-2">
                                <input
                                    type="text"
                                    value={newDueInput}
                                    onChange={(e) => {
                                        setNewDueInput(e.target.value);
                                        if (newDueInputError) setNewDueInputError('');
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Escape') setIsAdding(false);
                                    }}
                                    inputMode="numeric"
                                    placeholder="締切"
                                    className="w-full px-3 py-2 text-sm rounded-sm outline-none transition-colors bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 dark:focus:border-neutral-600 dark:focus:ring-neutral-600"
                                />
                            </div>
                            <div className="mt-2 flex items-center justify-end gap-2">
                                <button
                                    onClick={() => setIsAdding(false)}
                                    className="px-4 py-2 text-sm font-medium rounded-sm transition-colors bg-transparent text-neutral-900 dark:text-neutral-50 hover:bg-neutral-200 dark:hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
                                >
                                    閉じる
                                </button>
                                <button
                                    onClick={() => void addTask()}
                                    disabled={!newTaskText.trim() || !isDueInputValid}
                                    className="px-4 py-2 text-sm font-medium rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500 dark:focus-visible:ring-amber-400 bg-amber-500 text-neutral-50 hover:bg-amber-600 dark:bg-amber-500 dark:text-neutral-950 dark:hover:bg-amber-400 disabled:opacity-40"
                                >
                                    Add
                                </button>
                            </div>
                            {newDueInputError && (
                                <p className="mt-2 text-sm leading-6 text-amber-600 dark:text-amber-400">
                                    {newDueInputError}
                                </p>
                            )}
                            </div>
                        </div>
                    </div>
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
                            <li
                                key={task.id}
                                className="group rounded border border-neutral-400 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-900 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors p-1 sm:p-2"
                            >
                                <div className="flex items-start justify-between gap-2 sm:gap-4">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm sm:text-base leading-6 sm:leading-7 text-neutral-900 dark:text-neutral-50 break-words">
                                            {task.task}
                                        </p>
                                        {task.status === 'waiting' && task.due_at && (
                                            <p className="text-sm leading-6 text-neutral-700 dark:text-neutral-300">
                                                締切: {formatDateOnly(task.due_at)}
                                            </p>
                                        )}
                                        {task.status === 'completed' && (
                                            <p className="text-sm leading-6 text-neutral-500 dark:text-neutral-500">
                                                完了日: {formatDateOnly(task.status_changed_at)}
                                            </p>
                                        )}
                                        {task.status === 'deleted' && (
                                            <p className="text-sm leading-6 text-neutral-500 dark:text-neutral-500">
                                                削除日: {formatDateOnly(task.status_changed_at)}
                                            </p>
                                        )}
                                        {task.status === 'archived' && (
                                            <p className="text-sm leading-6 text-neutral-500 dark:text-neutral-500">
                                                アーカイブ解除予定: {formatDate(task.unarchive_at)}
                                            </p>
                                        )}
                                    </div>

                                    {/* アクションボタン */}
                                    {task.status === 'waiting' && (
                                        <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150">
                                             <ActionButton
                                                title="コピー"
                                                onClick={() => void copyTask(task.id)}
                                            >
                                                <Copy className="w-4 h-4" />
                                            </ActionButton>
                                            <ActionButton
                                                title="完了"
                                                onClick={() => completeTask(task.id)}
                                            >
                                                <Check className="w-4 h-4" />
                                            </ActionButton>
                                            <ActionButton
                                                title="アーカイブ"
                                                onClick={() => openArchiveDialog(task.id)}
                                            >
                                                <Archive className="w-4 h-4" />
                                            </ActionButton>
                                            <ActionButton
                                                title="削除"
                                                onClick={() => deleteTask(task.id)}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </ActionButton>
                                        </div>
                                    )}
                                    {task.status === 'completed' && (
                                        <button
                                            onClick={() => moveTaskToWaiting(task.id)}
                                            className="px-3 py-1 text-sm font-medium rounded-sm transition-colors text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
                                        >
                                            未完了に移行
                                        </button>
                                    )}
                                    {task.status === 'deleted' && (
                                        <button
                                            onClick={() => moveTaskToWaiting(task.id)}
                                            className="px-3 py-1 text-sm font-medium rounded-sm transition-colors text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
                                        >
                                            未完了に移行
                                        </button>
                                    )}
                                    {task.status === 'archived' && (
                                        <button
                                            onClick={() => moveTaskToWaiting(task.id)}
                                            className="px-3 py-1 text-sm font-medium rounded-sm transition-colors text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
                                        >
                                            取り消して未完了に移行
                                        </button>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {activeTab === 'waiting' && (
                <button
                    onClick={() => setIsAdding((v) => !v)}
                    className="sm:hidden fixed right-4 bottom-4 z-10 flex items-center gap-1 px-4 py-2 text-sm font-medium rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500 dark:focus-visible:ring-amber-400 bg-amber-500 text-neutral-50 hover:bg-amber-600 dark:bg-amber-500 dark:text-neutral-950 dark:hover:bg-amber-400"
                >
                    <Plus className="w-4 h-4" />
                    Add
                </button>
            )}

            {/* ArchiveDialog */}
            {archiveTargetId && (
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
                            <button
                                onClick={() => setArchiveTargetId(null)}
                                className="px-4 py-2 text-sm font-medium rounded-sm transition-colors bg-transparent text-neutral-900 dark:text-neutral-50 hover:bg-neutral-200 dark:hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
                            >
                                キャンセル
                            </button>
                            <button
                                onClick={() => void confirmArchive()}
                                className="px-4 py-2 text-sm font-medium rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500 dark:focus-visible:ring-amber-400 bg-amber-500 text-neutral-50 hover:bg-amber-600 dark:bg-amber-500 dark:text-neutral-950 dark:hover:bg-amber-400"
                            >
                                確定
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// ActionButton（アイコンゴーストボタン）
// ---------------------------------------------------------------------------
function ActionButton({
    children,
    onClick,
    title,
}: {
    children: React.ReactNode;
    onClick: () => void;
    title: string;
}) {
    return (
        <button
            title={title}
            onClick={onClick}
            className="p-2 rounded-sm transition-colors text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-700 hover:text-neutral-900 dark:hover:text-neutral-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
        >
            {children}
        </button>
    );
}
