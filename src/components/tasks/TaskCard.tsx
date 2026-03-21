import React from 'react';
import { Archive, ArchiveRestore, Check, Copy, RotateCcw, Trash2 } from 'lucide-react';
import { formatDate, formatDateOnly } from '@/src/lib/tasks/due-date';
import type { TaskStatus } from '@/src/lib/supabase/queries/tasks';

// タスクカード1件分に必要な最小データ。
type TaskItem = {
    id: string;
    task: string;
    status: TaskStatus;
    due_at: string | null;
    status_changed_at: string | null;
    unarchive_at: string | null;
};

const COPY_FEEDBACK_MS = 2000;

// 親から受け取る操作コールバック。
type TaskCardProps = {
    task: TaskItem;
    onCopy: (id: string) => Promise<boolean>;
    onComplete: (id: string) => void;
    onArchive: (id: string) => void;
    onDelete: (id: string) => void;
    onMoveToWaiting: (id: string) => void;
};

// ステータスに応じた表示と操作をまとめたタスクカード。
export function TaskCard({
    task,
    onCopy,
    onComplete,
    onArchive,
    onDelete,
    onMoveToWaiting,
}: TaskCardProps) {
    const [copySucceeded, setCopySucceeded] = React.useState(false);
    const copyFeedbackClearRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    React.useEffect(() => {
        return () => {
            if (copyFeedbackClearRef.current) {
                clearTimeout(copyFeedbackClearRef.current);
            }
        };
    }, []);

    async function handleCopy() {
        const ok = await onCopy(task.id);
        if (!ok) return;
        if (copyFeedbackClearRef.current) {
            clearTimeout(copyFeedbackClearRef.current);
        }
        setCopySucceeded(true);
        copyFeedbackClearRef.current = setTimeout(() => {
            setCopySucceeded(false);
            copyFeedbackClearRef.current = null;
        }, COPY_FEEDBACK_MS);
    }

    return (
        <li className="group rounded border border-neutral-400 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-900 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors p-1 sm:p-2">
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
                            解除予定日: {formatDate(task.unarchive_at)}
                        </p>
                    )}
                </div>

                {/* 未完了タスクはアイコン操作を表示する。 */}
                {task.status === 'waiting' && (
                    <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150">
                        <ActionButton
                            title={copySucceeded ? 'コピーしました' : 'コピー'}
                            onClick={() => void handleCopy()}
                        >
                            {copySucceeded ? (
                                <Check className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            ) : (
                                <Copy className="w-4 h-4" />
                            )}
                        </ActionButton>
                        <ActionButton title="完了" onClick={() => onComplete(task.id)}>
                            <Check className="w-4 h-4" />
                        </ActionButton>
                        <ActionButton title="アーカイブ" onClick={() => onArchive(task.id)}>
                            <Archive className="w-4 h-4" />
                        </ActionButton>
                        <ActionButton title="削除" onClick={() => onDelete(task.id)}>
                            <Trash2 className="w-4 h-4" />
                        </ActionButton>
                    </div>
                )}

                {/* 完了・削除・アーカイブは未完了へ戻す導線を出す。 */}
                {task.status === 'completed' && (
                    <ActionButton title="未完了に移行" onClick={() => onMoveToWaiting(task.id)}>
                        <RotateCcw className="w-4 h-4" />
                    </ActionButton>
                )}

                {task.status === 'deleted' && (
                    <ActionButton title="未完了に移行" onClick={() => onMoveToWaiting(task.id)}>
                        <RotateCcw className="w-4 h-4" />
                    </ActionButton>
                )}

                {task.status === 'archived' && (
                    <ActionButton title="アーカイブ解除" onClick={() => onMoveToWaiting(task.id)}>
                        <ArchiveRestore className="w-4 h-4" />
                    </ActionButton>
                )}
            </div>
        </li>
    );
}

function ActionButton({
    children,
    onClick,
    title,
}: {
    children: React.ReactNode;
    onClick: () => void;
    title: string;
}) {
    // タスクカード内で使う小さなアイコンボタン。説明はブラウザ標準の title ツールチップで表示する。
    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            onClick={onClick}
            className="p-2 rounded-sm transition-colors text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-700 hover:text-neutral-900 dark:hover:text-neutral-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
        >
            {children}
        </button>
    );
}
