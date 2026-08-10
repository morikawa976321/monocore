import React, { useLayoutEffect, useRef } from 'react';
import { Textarea } from '@/src/components/ui/Textarea';

/** 内容に応じて高さが自動調整される textarea。 */
export function AutoHeightTextarea({
    value,
    onChange,
    className,
    variant = 'plain',
    ...props
}: React.ComponentPropsWithoutRef<typeof Textarea>) {
    const ref = useRef<HTMLTextAreaElement>(null);

    // useLayoutEffect: 親のスクロール補正より前に高さを確定させる（useEffect だと1フレーム遅れて伸びる）。
    useLayoutEffect(() => {
        const ta = ref.current;
        if (!ta) return;
        ta.style.height = 'auto';
        ta.style.height = ta.scrollHeight + 'px';
    }, [value]);

    return (
        <Textarea
            ref={ref}
            value={value}
            onChange={onChange}
            variant={variant}
            // block: デフォルトの inline だと親の行ボックスに
            // ベースライン用の下余白が付き、下だけ空隙が開く。
            className={['block', className].filter(Boolean).join(' ')}
            {...props}
            style={{ overflow: 'hidden', ...(typeof props.style === 'object' ? props.style : undefined) }}
        />
    );
}
