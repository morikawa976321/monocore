import type { ButtonHTMLAttributes } from 'react';

type ButtonColor = 'primary' | 'secondary' | 'danger';
type ButtonSize = 'sm' | 'md';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    color?: ButtonColor;
    size?: ButtonSize;
};

const baseClassName =
    'inline-flex items-center justify-center gap-2 rounded-sm text-sm font-medium transition-colors duration-150 ease-in-out focus-visible:outline-none focus-visible:ring-1 disabled:opacity-50 disabled:pointer-events-none';

const colorClassNames: Record<ButtonColor, string> = {
    primary:
        'border-2 border-amber-700 bg-amber-500 text-neutral-50 hover:border-amber-800 hover:bg-amber-600 dark:border-amber-600 dark:bg-amber-500 dark:text-neutral-950 dark:hover:border-amber-500 dark:hover:bg-amber-400 focus-visible:ring-amber-500 dark:focus-visible:ring-amber-400',
    secondary:
        'border-2 border-neutral-600 bg-neutral-50 text-neutral-900 hover:border-neutral-700 hover:bg-neutral-200 dark:border-neutral-500 dark:bg-neutral-900 dark:text-neutral-50 dark:hover:border-neutral-400 dark:hover:bg-neutral-800 focus-visible:ring-neutral-500 dark:focus-visible:ring-neutral-500',
    danger:
        'border-2 border-red-700 bg-neutral-50 text-red-700 hover:bg-neutral-100 hover:border-red-900 hover:text-red-900 dark:border-red-700 dark:bg-neutral-900 dark:text-red-500 dark:hover:bg-neutral-800 dark:hover:border-red-600 dark:hover:text-red-300 focus-visible:ring-red-700 dark:focus-visible:ring-red-500',
};

const sizeClassNames: Record<ButtonSize, string> = {
    sm: 'px-2 py-1',
    md: 'px-4 py-2',
};

export function Button({
    color = 'secondary',
    size = 'md',
    type = 'button',
    className,
    ...props
}: ButtonProps) {
    const joinedClassName = [
        baseClassName,
        colorClassNames[color],
        sizeClassNames[size],
        className,
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <button
            type={type}
            className={joinedClassName}
            {...props}
        />
    );
}
