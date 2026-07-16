import Link from 'next/link';
import { Check } from 'lucide-react';
import { formatDateOnly } from '@/src/lib/tasks/due-date';

export type DueTask = { id: string; task: string; due_at: string | null; kind: 'overdue' | 'today' };

type DueTasksPanelProps = { tasks: DueTask[]; onComplete: (id: string) => void; isReadOnly?: boolean };

export function DueTasksPanel({ tasks, onComplete, isReadOnly = false }: DueTasksPanelProps) {
    if (tasks.length === 0) return null;

    return (
        <section className="rounded border border-neutral-400 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-900 overflow-hidden">
            <header className="px-2 sm:px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50 text-sm leading-6 flex items-center justify-between">
                <span className="text-neutral-700 dark:text-neutral-300">要注意タスク</span>
                <Link
                    href="/tasks"
                    className="text-sm text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-50 transition-colors duration-150 ease-in-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 rounded-sm px-1"
                >
                    Tasks
                </Link>
            </header>
            <ul className="p-1 sm:p-4 space-y-1">
                {tasks.map((t) => (
                    <li
                        key={t.id}
                        className="group flex items-start justify-between gap-2 rounded-sm p-1 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors duration-150 ease-in-out"
                    >
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                            {t.kind === 'overdue' ? (
                                <span className="shrink-0 px-1 py-0.5 rounded-sm border border-amber-500 dark:border-amber-400 text-amber-600 dark:text-amber-400 text-sm font-medium leading-none">
                                    期限切れ
                                </span>
                            ) : (
                                <span className="shrink-0 px-1 py-0.5 rounded-sm border border-neutral-400 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 text-sm font-medium leading-none">
                                    今日
                                </span>
                            )}
                            <div className="min-w-0">
                                <p className="text-sm leading-6 text-neutral-900 dark:text-neutral-50 break-words whitespace-pre-wrap">
                                    {t.task}
                                </p>
                                <p className="text-sm leading-6 text-neutral-700 dark:text-neutral-300">
                                    締切: {formatDateOnly(t.due_at)}
                                </p>
                            </div>
                        </div>
                        <div className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150">
                            <button
                                type="button"
                                title="完了"
                                aria-label="完了"
                                disabled={isReadOnly}
                                onClick={() => onComplete(t.id)}
                                className="p-2 rounded-sm transition-colors text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-700 hover:text-neutral-900 dark:hover:text-neutral-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 disabled:opacity-50"
                            >
                                <Check className="w-4 h-4" />
                            </button>
                        </div>
                    </li>
                ))}
            </ul>
        </section>
    );
}
