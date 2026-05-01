import React from 'react';
import { X } from 'lucide-react';
import { AutoHeightTextarea } from '@/src/components/schedules/AutoHeightTextarea';

type AddTaskFormProps = {
    mode: 'desktop' | 'mobile';
    text: string;
    dueInput: string;
    dueInputError: string;
    isDueInputValid: boolean;
    mobileKeyboardOffset?: number;
    onTextChange: (value: string) => void;
    onDueInputChange: (value: string) => void;
    onSubmit: () => void;
    onClose: () => void;
};

// PC/モバイル共通のタスク追加フォーム。
export function AddTaskForm({
    mode,
    text,
    dueInput,
    dueInputError,
    isDueInputValid,
    mobileKeyboardOffset = 0,
    onTextChange,
    onDueInputChange,
    onSubmit,
    onClose,
}: AddTaskFormProps) {
    // テキスト・締切入力中のショートカット（送信/閉じる）を処理する。
    const handleFormKeyDown = (event: React.KeyboardEvent) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            onSubmit();
        }
        if (event.key === 'Escape') {
            onClose();
        }
    };

    if (mode === 'desktop') {
        // デスクトップはインラインフォームとして表示する。
        return (
            <div className="hidden sm:block px-2 sm:px-4 py-2 sm:py-4 mb-2 sm:mb-0">
                <div className="rounded border border-neutral-400 dark:border-neutral-600 p-2 sm:p-4">
                    <div className="flex items-start gap-2 sm:gap-4">
                        <AutoHeightTextarea
                            value={text}
                            onChange={(event) => onTextChange(event.target.value)}
                            onKeyDown={handleFormKeyDown}
                            placeholder="タスクの内容"
                            autoFocus
                            rows={1}
                            className="flex-1 px-3 py-2 text-sm rounded-sm outline-none transition-colors bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 dark:focus:border-neutral-600 dark:focus:ring-neutral-600 min-h-10 resize-none"
                        />
                        <input
                            type="text"
                            value={dueInput}
                            onChange={(event) => onDueInputChange(event.target.value)}
                            inputMode="numeric"
                            placeholder="締切"
                            className="w-36 px-3 py-2 text-sm rounded-sm outline-none transition-colors bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-50 focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 dark:focus:border-neutral-600 dark:focus:ring-neutral-600"
                            onKeyDown={handleFormKeyDown}
                        />
                        <button
                            onClick={onSubmit}
                            disabled={!text.trim() || !isDueInputValid}
                            className="px-4 py-2 text-sm font-medium rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500 dark:focus-visible:ring-amber-400 bg-amber-500 text-neutral-50 hover:bg-amber-600 dark:bg-amber-500 dark:text-neutral-950 dark:hover:bg-amber-400 disabled:opacity-40"
                        >
                            Add
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 text-sm font-medium rounded-sm transition-colors text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    {dueInputError && (
                        <p className="mt-2 text-sm leading-6 text-amber-600 dark:text-amber-400">
                            {dueInputError}
                        </p>
                    )}
                </div>
            </div>
        );
    }

    return (
        // モバイルはオーバーレイパネルとして表示する。
        <div className="sm:hidden fixed inset-0 z-40">
            <button
                aria-label="追加パネルを閉じる"
                onClick={onClose}
                className="absolute inset-0 bg-neutral-950/50"
            />
            <div
                className="absolute inset-0 z-50 flex items-end justify-center p-2"
                style={{
                    // ソフトキーボード表示時にフォームが隠れないように余白を加える。
                    paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${mobileKeyboardOffset}px + 0.5rem)`,
                }}
                onClick={onClose}
            >
                <div
                    className="w-full max-w-sm rounded border border-neutral-400 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-900 p-2"
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="flex items-start gap-2">
                        <AutoHeightTextarea
                            value={text}
                            onChange={(event) => onTextChange(event.target.value)}
                            onKeyDown={handleFormKeyDown}
                            placeholder="タスクの内容"
                            autoFocus
                            rows={1}
                            className="flex-1 px-3 py-2 text-sm rounded-sm outline-none transition-colors bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 dark:focus:border-neutral-600 dark:focus:ring-neutral-600 min-h-10 resize-none"
                        />
                    </div>
                    <div className="mt-2">
                        <input
                            type="text"
                            value={dueInput}
                            onChange={(event) => onDueInputChange(event.target.value)}
                            onKeyDown={handleFormKeyDown}
                            inputMode="numeric"
                            placeholder="締切"
                            className="w-full px-3 py-2 text-sm rounded-sm outline-none transition-colors bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 dark:focus:border-neutral-600 dark:focus:ring-neutral-600"
                        />
                    </div>
                    <div className="mt-2 flex items-center justify-end gap-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium rounded-sm transition-colors bg-transparent text-neutral-900 dark:text-neutral-50 hover:bg-neutral-200 dark:hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
                        >
                            閉じる
                        </button>
                        <button
                            onClick={onSubmit}
                            disabled={!text.trim() || !isDueInputValid}
                            className="px-4 py-2 text-sm font-medium rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500 dark:focus-visible:ring-amber-400 bg-amber-500 text-neutral-50 hover:bg-amber-600 dark:bg-amber-500 dark:text-neutral-950 dark:hover:bg-amber-400 disabled:opacity-40"
                        >
                            Add
                        </button>
                    </div>
                    {dueInputError && (
                        <p className="mt-2 text-sm leading-6 text-amber-600 dark:text-amber-400">
                            {dueInputError}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
