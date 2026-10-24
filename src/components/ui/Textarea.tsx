import type { Ref, TextareaHTMLAttributes } from 'react';

type TextareaVariant = 'field' | 'plain';

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
    variant?: TextareaVariant;
    ref?: Ref<HTMLTextAreaElement>;
};

const baseClassName =
    'w-full text-sm outline-none transition-colors duration-150 ease-in-out disabled:opacity-50 disabled:pointer-events-none';

const variantClassNames: Record<TextareaVariant, string> = {
    field:
        'rounded-sm border border-neutral-300 bg-neutral-200 px-3 py-2 text-neutral-900 placeholder:text-neutral-500 focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-50 dark:placeholder:text-neutral-500 dark:focus:border-neutral-600 dark:focus:ring-neutral-600',
    plain:
        'border-none bg-transparent px-0 py-0 text-neutral-900 placeholder:text-neutral-500 dark:text-neutral-100 dark:placeholder:text-neutral-500',
};

/** 標準の複数行入力。見た目は variant、レイアウトは className。 */
export function Textarea({
    variant = 'field',
    className,
    ref,
    ...props
}: TextareaProps) {
    const joinedClassName = [baseClassName, variantClassNames[variant], className]
        .filter(Boolean)
        .join(' ');

    return <textarea ref={ref} className={joinedClassName} {...props} />;
}
