import React, { useLayoutEffect, useRef } from 'react';
import { Textarea } from '@/src/components/ui/Textarea';

function fitHeight(ta: HTMLTextAreaElement | null) {
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
}

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
        fitHeight(ref.current);
    }, [value]);

    // 画面幅が変わると折り返しと、sm: で切り替える文字の大きさ・行の高さが変わる。値が同じでも測り直す
    // （測り直さないと overflow: hidden で最終行が欠ける）。
    useLayoutEffect(() => {
        const onResize = () => fitHeight(ref.current);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

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
