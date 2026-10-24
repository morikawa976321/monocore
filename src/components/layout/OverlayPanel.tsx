'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/src/components/ui/Button';

function overlayBoxInParent(parent: HTMLElement): { top: number; height: number } {
    const r = parent.getBoundingClientRect();
    const vv = window.visualViewport;
    if (!vv) return { top: 0, height: parent.clientHeight };
    const vt = Math.max(r.top, vv.offsetTop);
    const vb = Math.min(r.bottom, vv.offsetTop + vv.height);
    return { top: vt - r.top, height: Math.max(0, vb - vt) };
}

type OverlayPanelProps = {
    /** dialog の名前（aria-label）。閉じるボタンの aria-label は「{label}を閉じる」。 */
    label: string;
    onClose: () => void;
    /** true なら高さを中身に合わせる（画面の高さまで）。false なら画面の高さいっぱい（Inbox のテキスト欄）。 */
    fitContent?: boolean;
    children: ReactNode;
};

/**
 * Schedules の上に開くモーダルの外枠（Inbox と Tasks で共有）。背面を暗くしてタップで閉じ、
 * モバイルでは背面のスクロールを止め、ソフトキーボードで縮む可視領域（visualViewport）に合わせる。
 */
export function OverlayPanel({ label, onClose, fitContent = false, children }: OverlayPanelProps) {
    const overlayHostRef = useRef<HTMLDivElement>(null);
    const [overlayBox, setOverlayBox] = useState<{ top: number; height: number } | null>(null);

    const updateOverlayBox = useCallback(() => {
        const parent = overlayHostRef.current?.parentElement;
        if (parent) setOverlayBox(overlayBoxInParent(parent));
    }, []);

    useLayoutEffect(() => {
        const rafId = window.requestAnimationFrame(updateOverlayBox);
        const vv = window.visualViewport;
        vv?.addEventListener('resize', updateOverlayBox);
        vv?.addEventListener('scroll', updateOverlayBox);
        window.addEventListener('resize', updateOverlayBox);
        const parent = overlayHostRef.current?.parentElement;
        const ro = parent ? new ResizeObserver(updateOverlayBox) : null;
        if (parent && ro) ro.observe(parent);
        return () => {
            window.cancelAnimationFrame(rafId);
            vv?.removeEventListener('resize', updateOverlayBox);
            vv?.removeEventListener('scroll', updateOverlayBox);
            window.removeEventListener('resize', updateOverlayBox);
            ro?.disconnect();
        };
    }, [updateOverlayBox]);

    // モバイルで背面が動かないようにする：html/body の overflow ロック + iOS 向け fixed body（スクロール位置は復元）。
    useLayoutEffect(() => {
        const scrollY = window.scrollY;
        const html = document.documentElement;
        const body = document.body;
        const prevHtmlOverflow = html.style.overflow;
        const prev = {
            overflow: body.style.overflow,
            position: body.style.position,
            top: body.style.top,
            width: body.style.width,
            left: body.style.left,
            right: body.style.right,
        };

        html.style.overflow = 'hidden';
        body.style.overflow = 'hidden';
        body.style.position = 'fixed';
        body.style.top = `-${scrollY}px`;
        body.style.width = '100%';
        body.style.left = '0';
        body.style.right = '0';

        return () => {
            html.style.overflow = prevHtmlOverflow;
            body.style.overflow = prev.overflow;
            body.style.position = prev.position;
            body.style.top = prev.top;
            body.style.width = prev.width;
            body.style.left = prev.left;
            body.style.right = prev.right;
            window.scrollTo(0, scrollY);
        };
    }, []);

    return (
        <>
            {/* 背面を暗くしてタップで閉じる（オーバーレイ: z-40 / 本体: z-50） */}
            <div
                className="absolute inset-0 z-40 bg-neutral-950/50"
                onClick={onClose}
                aria-hidden="true"
            />
            <div
                ref={overlayHostRef}
                className="pointer-events-none absolute left-0 right-0 z-50 flex flex-col items-center p-4 sm:p-6"
                style={
                    overlayBox
                        ? { top: overlayBox.top, height: overlayBox.height, bottom: 'auto' }
                        : { top: 0, bottom: 0 }
                }
            >
                <aside
                    role="dialog"
                    aria-modal="true"
                    aria-label={label}
                    className={`pointer-events-auto flex ${fitContent ? 'max-h-full' : 'h-full'} min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded border-2 border-neutral-400 bg-neutral-200 dark:border-neutral-600 dark:bg-neutral-800`}
                >
                    {children}
                    {/* モバイル・デスクトップ：右下で閉じる */}
                    <div className="flex shrink-0 justify-end border-t border-neutral-300 px-2 py-2 dark:border-neutral-700">
                        <Button type="button" color="secondary" size="md" onClick={onClose} aria-label={`${label}を閉じる`}>
                            閉じる
                        </Button>
                    </div>
                </aside>
            </div>
        </>
    );
}
