import { Button } from '@/src/components/ui/Button';

type InboxPanelProps = {
    content: string;
    onContentChange: (value: string) => void;
    onClose: () => void;
};

export function InboxPanel({ content, onContentChange, onClose }: InboxPanelProps) {
    return (
        <>
            {/* 背面を暗くしてタップで閉じる（モーダルと同じレイヤー規則: z-40 / z-50） */}
            <div
                className="absolute inset-0 z-40 bg-neutral-950/50"
                onClick={onClose}
                aria-hidden="true"
            />
            <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
                <aside
                    role="dialog"
                    aria-modal="true"
                    aria-label="Inbox"
                    className="pointer-events-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded border-2 border-neutral-400 bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-900"
                >
                    <div className="flex min-h-0 flex-1 flex-col p-4">
                        <textarea
                            value={content}
                            onChange={(e) => onContentChange(e.target.value)}
                            className="min-h-0 w-full flex-1 resize-none bg-transparent text-sm sm:text-base leading-6 text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-neutral-100 dark:placeholder:text-neutral-600"
                            spellCheck={false}
                            autoComplete="off"
                            autoCorrect="off"
                        />
                    </div>
                    {/* モバイルのみ：親指圏の右下で閉じる。デスクトップはヘッダーの Inbox を使用。 */}
                    <div className="flex shrink-0 justify-end border-t border-neutral-200 px-2 py-2 dark:border-neutral-800 sm:hidden">
                        <Button type="button" color="secondary" size="md" onClick={onClose} aria-label="Inboxを閉じる">
                            閉じる
                        </Button>
                    </div>
                </aside>
            </div>
        </>
    );
}
