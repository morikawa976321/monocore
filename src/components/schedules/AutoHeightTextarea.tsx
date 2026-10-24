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

    // 値が同じでも、欄の幅が変われば（親にスクロールバーが出る等）折り返しが変わり、画面幅が sm をまたげば
    // 文字の大きさ・行の高さが変わる。どちらでも測り直す（測り直さないと overflow: hidden で最終行が欠ける）。
    // 画面の回転では欄の幅が同じまま sm をまたぐことがあるので、欄の幅とは別に画面の resize も見る。
    // 欄は幅だけ見る（高さの変化は fitHeight 自身が起こす）。測り直しは次のフレームに送る。ResizeObserver の
    // 通知の中で高さを変えると「ResizeObserver loop completed with undelivered notifications」が出る。
    useLayoutEffect(() => {
        const ta = ref.current;
        if (!ta) return;
        let raf = 0;
        const refit = () => {
            window.cancelAnimationFrame(raf);
            raf = window.requestAnimationFrame(() => fitHeight(ta));
        };
        let width = ta.getBoundingClientRect().width;
        const ro = new ResizeObserver(() => {
            const w = ta.getBoundingClientRect().width;
            if (w === width) return;
            width = w;
            refit();
        });
        ro.observe(ta);
        window.addEventListener('resize', refit);
        return () => {
            ro.disconnect();
            window.removeEventListener('resize', refit);
            window.cancelAnimationFrame(raf);
        };
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
