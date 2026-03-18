'use client';

import React, { useState } from 'react';
import {
    Check,
    Archive,
    Trash2,
    Plus,
    X,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------
type TaskStatus = 'waiting' | 'completed' | 'archived' | 'deleted';

type Task = {
    id: string;
    task: string;
    status: TaskStatus;
    due_at: string | null;
    status_changed_at: string | null;
    unarchive_at: string | null;
};

// ---------------------------------------------------------------------------
// モックデータ
// ---------------------------------------------------------------------------
const MOCK_TASKS: Task[] = [
    {
        id: '1',
        task: 'デザインレビューの資料を作成する',
        status: 'waiting',
        due_at: '2026-03-10T18:00:00+09:00',
        status_changed_at: null,
        unarchive_at: null,
    },
    {
        id: '2',
        task: '週次ミーティングのアジェンダを共有する',
        status: 'waiting',
        due_at: '2026-03-08T09:00:00+09:00',
        status_changed_at: null,
        unarchive_at: null,
    },
    {
        id: '3',
        task: 'ユーザーインタビューのスケジュールを調整する',
        status: 'waiting',
        due_at: null,
        status_changed_at: null,
        unarchive_at: null,
    },
    {
        id: '4',
        task: 'プロトタイプのフィードバックをまとめる',
        status: 'completed',
        due_at: null,
        status_changed_at: '2026-03-06T14:30:00+09:00',
        unarchive_at: null,
    },
    {
        id: '5',
        task: '競合調査レポートを提出する',
        status: 'completed',
        due_at: '2026-03-05T17:00:00+09:00',
        status_changed_at: '2026-03-05T16:50:00+09:00',
        unarchive_at: null,
    },
    {
        id: '6',
        task: '不要なSlackチャンネルを整理する',
        status: 'deleted',
        due_at: null,
        status_changed_at: '2026-03-04T11:00:00+09:00',
        unarchive_at: null,
    },
    {
        id: '7',
        task: '旧バージョンのドキュメントを削除する',
        status: 'deleted',
        due_at: null,
        status_changed_at: '2026-03-03T09:15:00+09:00',
        unarchive_at: null,
    },
    {
        id: '8',
        task: '四半期ロードマップの草案を作成する',
        status: 'archived',
        due_at: null,
        status_changed_at: '2026-03-02T10:00:00+09:00',
        unarchive_at: '2026-03-20T09:00:00+09:00',
    },
];

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
    const [tasks, setTasks] = useState<Task[]>(MOCK_TASKS);
    const [activeTab, setActiveTab] = useState<TaskStatus>('waiting');
    const [isAdding, setIsAdding] = useState(false);
    const [newTaskText, setNewTaskText] = useState('');
    const [newDueAt, setNewDueAt] = useState('');
    const [archiveTargetId, setArchiveTargetId] = useState<string | null>(null);
    const [unarchiveAt, setUnarchiveAt] = useState('');

    const visibleTasks = tasks.filter((t) => t.status === activeTab);

    // --- アクション ---
    const now = () => new Date().toISOString();

    function addTask() {
        const text = newTaskText.trim();
        if (!text) return;
        const newTask: Task = {
            id: crypto.randomUUID(),
            task: text,
            status: 'waiting',
            due_at: newDueAt ? new Date(newDueAt).toISOString() : null,
            status_changed_at: null,
            unarchive_at: null,
        };
        setTasks((prev) => [newTask, ...prev]);
        setNewTaskText('');
        setNewDueAt('');
        setIsAdding(false);
    }

    function completeTask(id: string) {
        setTasks((prev) =>
            prev.map((t) =>
                t.id === id
                    ? { ...t, status: 'completed', status_changed_at: now() }
                    : t
            )
        );
    }

    function deleteTask(id: string) {
        setTasks((prev) =>
            prev.map((t) =>
                t.id === id
                    ? { ...t, status: 'deleted', status_changed_at: now() }
                    : t
            )
        );
    }

    function openArchiveDialog(id: string) {
        setArchiveTargetId(id);
        setUnarchiveAt('');
    }

    function confirmArchive() {
        if (!archiveTargetId) return;
        setTasks((prev) =>
            prev.map((t) =>
                t.id === archiveTargetId
                    ? {
                        ...t,
                        status: 'archived',
                        status_changed_at: now(),
                        unarchive_at: unarchiveAt
                            ? new Date(unarchiveAt).toISOString()
                            : null,
                    }
                    : t
            )
        );
        setArchiveTargetId(null);
    }

    function unarchiveTask(id: string) {
        setTasks((prev) =>
            prev.map((t) =>
                t.id === id
                    ? { ...t, status: 'waiting', status_changed_at: now(), unarchive_at: null }
                    : t
            )
        );
    }

    return (
        <div className="flex flex-col h-screen">
            {/* Header */}
            <header className="flex items-center justify-between px-2 sm:px-6 py-2 sm:py-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 shrink-0">
                <h1 className="text-base sm:text-lg font-medium leading-6 sm:leading-7 tracking-widest uppercase text-neutral-900 dark:text-neutral-100">
                    Tasks
                </h1>
                {activeTab === 'waiting' && (
                    <button
                        onClick={() => setIsAdding((v) => !v)}
                        className="flex items-center gap-1 px-4 py-2 text-sm font-medium rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500 dark:focus-visible:ring-amber-400 bg-amber-500 text-neutral-50 hover:bg-amber-600 dark:bg-amber-500 dark:text-neutral-950 dark:hover:bg-amber-400"
                    >
                        <Plus className="w-4 h-4" />
                        Add
                    </button>
                )}
            </header>

            {/* TabBar */}
            <div className="flex items-end gap-2 sm:gap-6 px-2 sm:px-6 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 shrink-0">
                {TABS.map((tab) => (
                    <button
                        key={tab.status}
                        onClick={() => {
                            setActiveTab(tab.status);
                            setIsAdding(false);
                        }}
                        className={[
                            'py-2 sm:py-4 text-sm font-medium border-b-2 transition-colors focus-visible:outline-none',
                            activeTab === tab.status
                                ? 'border-amber-500 text-neutral-900 dark:text-neutral-50'
                                : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300',
                        ].join(' ')}
                    >
                        {tab.label}
                        <span className="ml-2 text-sm text-neutral-400 dark:text-neutral-600">
                            {tasks.filter((t) => t.status === tab.status).length}
                        </span>
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                {/* AddTaskForm */}
                {activeTab === 'waiting' && isAdding && (
                    <div className="px-2 sm:px-6 py-2 sm:py-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
                        <div className="flex items-center gap-2 sm:gap-4">
                            <input
                                type="text"
                                value={newTaskText}
                                onChange={(e) => setNewTaskText(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') addTask();
                                    if (e.key === 'Escape') setIsAdding(false);
                                }}
                                placeholder="タスクの内容"
                                autoFocus
                                className="flex-1 px-3 py-2 text-sm rounded-sm outline-none transition-colors bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 dark:focus:border-neutral-600 dark:focus:ring-neutral-600"
                            />
                            <input
                                type="datetime-local"
                                value={newDueAt}
                                onChange={(e) => setNewDueAt(e.target.value)}
                                className="px-3 py-2 text-sm rounded-sm outline-none transition-colors bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-50 focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 dark:focus:border-neutral-600 dark:focus:ring-neutral-600"
                            />
                            <button
                                onClick={addTask}
                                disabled={!newTaskText.trim()}
                                className="px-4 py-2 text-sm font-medium rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500 dark:focus-visible:ring-amber-400 bg-amber-500 text-neutral-50 hover:bg-amber-600 dark:bg-amber-500 dark:text-neutral-950 dark:hover:bg-amber-400 disabled:opacity-40"
                            >
                                追加
                            </button>
                            <button
                                onClick={() => setIsAdding(false)}
                                className="p-2 text-sm font-medium rounded-sm transition-colors text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}

                {/* TaskList */}
                {visibleTasks.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-neutral-500 dark:text-neutral-500 text-sm">
                        タスクはありません
                    </div>
                ) : (
                    <ul>
                        {visibleTasks.map((task) => (
                            <li
                                key={task.id}
                                className="group flex items-center gap-2 sm:gap-4 px-2 sm:px-6 py-2 sm:py-4 border-b border-neutral-200 dark:border-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors"
                            >
                                {/* タスク内容 */}
                                <span
                                    className={[
                                        'flex-1 text-sm leading-6 sm:text-base sm:leading-7',
                                        task.status === 'completed'
                                            ? 'line-through text-neutral-500 dark:text-neutral-500'
                                            : task.status === 'deleted'
                                                ? 'text-neutral-500 dark:text-neutral-500'
                                                : 'text-neutral-900 dark:text-neutral-50',
                                    ].join(' ')}
                                >
                                    {task.task}
                                </span>

                                {/* 右側メタ情報 */}
                                {task.status === 'waiting' && task.due_at && (
                                    <span className="text-sm leading-6 text-neutral-500 dark:text-neutral-500 shrink-0">
                                        {formatDateOnly(task.due_at)}
                                    </span>
                                )}
                                {task.status === 'completed' && (
                                    <span className="text-sm leading-6 text-neutral-500 dark:text-neutral-500 shrink-0">
                                        {formatDate(task.status_changed_at)}
                                    </span>
                                )}
                                {task.status === 'deleted' && (
                                    <span className="text-sm leading-6 text-neutral-500 dark:text-neutral-500 shrink-0">
                                        {formatDate(task.status_changed_at)}
                                    </span>
                                )}
                                {task.status === 'archived' && (
                                    <span className="text-sm leading-6 text-neutral-500 dark:text-neutral-500 shrink-0">
                                        {formatDate(task.unarchive_at)} まで
                                    </span>
                                )}

                                {/* アクションボタン */}
                                {task.status === 'waiting' && (
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
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
                                {task.status === 'archived' && (
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                                        <button
                                            title="アーカイブ解除"
                                            onClick={() => unarchiveTask(task.id)}
                                            className="px-3 py-1 text-sm font-medium rounded-sm transition-colors text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
                                        >
                                            解除
                                        </button>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>

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
                                onClick={confirmArchive}
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
