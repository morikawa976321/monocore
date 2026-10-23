'use client';

import { OverlayPanel } from '@/src/components/layout/OverlayPanel';
import { Textarea } from '@/src/components/ui/Textarea';

type InboxPanelProps = {
    content: string;
    onContentChange: (value: string) => void;
    onClose: () => void;
    isReadOnly?: boolean;
};

export function InboxPanel({ content, onContentChange, onClose, isReadOnly = false }: InboxPanelProps) {
    return (
        <OverlayPanel label="Inbox" onClose={onClose}>
            <div className="flex min-h-0 flex-1 flex-col p-4">
                <Textarea
                    variant="plain"
                    value={content}
                    onChange={(e) => onContentChange(e.target.value)}
                    readOnly={isReadOnly}
                    className="min-h-0 flex-1 resize-none overflow-y-auto leading-6 sm:text-base sm:leading-7"
                    spellCheck={false}
                    autoComplete="off"
                    autoCorrect="off"
                />
            </div>
        </OverlayPanel>
    );
}
