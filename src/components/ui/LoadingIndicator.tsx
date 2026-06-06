import { Loader2 } from 'lucide-react';

type LoadingIndicatorSize = 'sm' | 'md';

type LoadingIndicatorProps = {
    size?: LoadingIndicatorSize;
    label?: string;
    className?: string;
};

const sizeClassNames: Record<LoadingIndicatorSize, string> = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
};

export function LoadingIndicator({
    size = 'sm',
    label = '読み込み中',
    className,
}: LoadingIndicatorProps) {
    return (
        <span
            role="status"
            aria-label={label}
            className={className ?? 'inline-flex items-center justify-center'}
        >
            <Loader2
                className={`${sizeClassNames[size]} animate-spin text-neutral-500 dark:text-neutral-500`}
                aria-hidden="true"
            />
        </span>
    );
}
