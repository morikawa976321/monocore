import type { ButtonHTMLAttributes, Ref } from 'react';

type ButtonColor = 'primary' | 'secondary' | 'danger' | 'ghost' | 'link';
type ButtonSize = 'md' | 'icon' | 'fab' | 'nav' | 'link';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    color?: ButtonColor;
    size?: ButtonSize;
    ref?: Ref<HTMLButtonElement>;
};

// text-sm はほぼ全形が使う。font-weight・rounded・justify・gap・padding は
// 形ごとに違う（例: nav は左寄せ、link は font-normal）ため size 側に持たせ、
// ここには本当に全形共通のものだけを置く。
const baseClassName =
    'inline-flex items-center text-sm transition-colors duration-150 ease-in-out focus-visible:outline-none focus-visible:ring-1 disabled:opacity-50 disabled:pointer-events-none';

const colorClassNames: Record<ButtonColor, string> = {
    primary:
        'border-2 border-amber-700 bg-amber-500 text-neutral-50 hover:border-amber-800 hover:bg-amber-600 dark:border-amber-600 dark:bg-amber-500 dark:text-neutral-950 dark:hover:border-amber-500 dark:hover:bg-amber-400 focus-visible:ring-amber-500 dark:focus-visible:ring-amber-400',
    secondary:
        'border-2 border-neutral-600 bg-neutral-50 text-neutral-900 hover:border-neutral-700 hover:bg-neutral-200 dark:border-neutral-500 dark:bg-neutral-900 dark:text-neutral-50 dark:hover:border-neutral-400 dark:hover:bg-neutral-800 focus-visible:ring-neutral-500 dark:focus-visible:ring-neutral-500',
    danger:
        'border-2 border-red-700 bg-neutral-50 text-red-700 hover:bg-neutral-100 hover:border-red-900 hover:text-red-900 dark:border-red-700 dark:bg-neutral-900 dark:text-red-500 dark:hover:bg-neutral-800 dark:hover:border-red-600 dark:hover:text-red-300 focus-visible:ring-red-700 dark:focus-visible:ring-red-500',
    // 枠なし・hover背景のみ。アイコンのみの正方形(ゴースト)とナビ行で共有する。
    ghost: 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-50 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-600',
    // 枠なし・背景なしのテキストリンク。
    link: 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-50 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-600',
};

const sizeClassNames: Record<ButtonSize, string> = {
    md: 'justify-center gap-2 rounded-sm font-medium px-4 py-2',
    // アイコンのみの正方形(32px)。ゴーストの close/undo アイコン用。
    icon: 'justify-center rounded-sm font-medium w-8 h-8 p-0',
    // アイコンのみの正方形(48px)。FAB用。
    fab: 'justify-center rounded-sm font-medium w-12 h-12 p-0',
    // 全幅・左寄せのナビ行 / 開閉バー。gap/文字サイズ/group-hover挙動は呼び出し側のclassNameで足す
    // (アイコン+ラベルの間隔やレスポンシブ拡張が箇所ごとに違うため)。
    nav: 'rounded-sm w-full px-2 py-2 font-medium',
    // テキストリンク。
    link: 'rounded-sm px-0 py-0 font-normal underline underline-offset-4',
};

export function Button({
    color = 'secondary',
    size = 'md',
    type = 'button',
    className,
    ref,
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
            ref={ref}
            type={type}
            className={joinedClassName}
            {...props}
        />
    );
}
