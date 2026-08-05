import React, { useLayoutEffect, useRef } from 'react';

/** 内容に応じて高さが自動調整される textarea。 */
export function AutoHeightTextarea({
    value,
    onChange,
    className,
    ...props
}: React.ComponentPropsWithoutRef<'textarea'>) {
    const ref = useRef<HTMLTextAreaElement>(null);

    // useLayoutEffect: 親のスクロール補正より前に高さを確定させる（useEffect だと1フレーム遅れて伸びる）。
    useLayoutEffect(() => {
        const ta = ref.current;
        if (!ta) return;
        ta.style.height = 'auto';
        ta.style.height = ta.scrollHeight + 'px';
    }, [value]);

    return (
        <textarea
            ref={ref}
            value={value}
            onChange={onChange}
            // block: デフォルトの inline-block だと親の行ボックスに
            // ベースライン用の下余白が付き、下だけ空隙が開く。
            className={['block', className].filter(Boolean).join(' ')}
            style={{ overflow: 'hidden' }}
            {...props}
        />
    );
}
