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

    // 欄の幅が変わると（画面幅の変更、親にスクロールバーが出る等）折り返しが変わり、画面幅が sm をまたげば
    // 文字の大きさ・行の高さも変わる。値が同じでも測り直す（測り直さないと overflow: hidden で最終行が欠ける）。
    // 見るのは幅だけ。高さの変化は fitHeight 自身が起こすので、それに反応すると測り直しが連鎖する。
    useLayoutEffect(() => {
        const ta = ref.current;
        if (!ta) return;
        let width = ta.getBoundingClientRect().width;
        const ro = new ResizeObserver(() => {
            const w = ta.getBoundingClientRect().width;
            if (w === width) return;
            width = w;
            fitHeight(ta);
        });
        ro.observe(ta);
        return () => ro.disconnect();
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
