import type { InputHTMLAttributes, Ref } from 'react';

type InputVariant = 'field' | 'plain';

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
    variant?: InputVariant;
    /** 文字をグレーにする（期限切れの行など、有効でないことを示す）。 */
    muted?: boolean;
    ref?: Ref<HTMLInputElement>;
};

const baseClassName =
    'w-full text-sm outline-none transition-colors duration-150 ease-in-out disabled:opacity-50 disabled:pointer-events-none';

const variantClassNames: Record<InputVariant, string> = {
    field:
        'rounded-sm border border-neutral-200 bg-neutral-50 px-3 py-2 placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:placeholder:text-neutral-600 dark:focus:border-neutral-600 dark:focus:ring-neutral-600 aria-invalid:border-amber-500 dark:aria-invalid:border-amber-400',
    plain:
        'border-none bg-transparent px-0 py-0 placeholder:text-neutral-400 dark:placeholder:text-neutral-600',
};

const textClassNames: Record<InputVariant, { normal: string; muted: string }> = {
    field: { normal: 'text-neutral-900 dark:text-neutral-50', muted: 'text-neutral-500 dark:text-neutral-500' },
    plain: { normal: 'text-neutral-900 dark:text-neutral-100', muted: 'text-neutral-500 dark:text-neutral-500' },
};

/** 標準のテキスト入力。見た目は variant（と muted）、レイアウトは className。aria-invalid を渡すと枠が琥珀色になる。 */
export function Input({
    variant = 'field',
    muted = false,
    className,
    ref,
    ...props
}: InputProps) {
    const textClassName = textClassNames[variant][muted ? 'muted' : 'normal'];
    const joinedClassName = [baseClassName, variantClassNames[variant], textClassName, className]
        .filter(Boolean)
        .join(' ');

    return <input ref={ref} className={joinedClassName} {...props} />;
}
