import { useEffect, useState, type PointerEvent, type ReactNode } from 'react';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';

interface Note { key: string; text: string; left: number; top: number }

/** 箱の最大幅(max-w-xs = 320px)と画面端の余白。右端で切れないよう left をこの分だけ内側に寄せる。 */
const BOX = 320;
const EDGE = 16;

/**
 * 表の行のイベント・メモを、列を持たずにツールチップで出す(本人の指示 2026-10-23: ふだんは畳み、必要なときだけ出す)。
 * マウスは行に乗っている間だけ、タッチは印(吹き出し)のタップで開閉する。行のタップは編集に使うので印だけが開閉を持つ。
 * 印は空いている操作列に置く(年月や名前の後ろに置くと、狭い画面で表が横にはみ出す)。
 * fixed で置くので、スクロールしたら行とずれる前に閉じる。
 */
export function useRowNote() {
    const [note, setNote] = useState<Note | null>(null);

    useEffect(() => {
        if (!note) return;
        const close = () => setNote(null);
        const outside = (event: globalThis.PointerEvent) => { if (!(event.target as Element).closest('[data-row-note]')) close(); };
        window.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);
        document.addEventListener('pointerdown', outside);
        return () => {
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('resize', close);
            document.removeEventListener('pointerdown', outside);
        };
    }, [note]);

    function open(key: string, text: string, row: Element) {
        const rect = row.getBoundingClientRect();
        setNote({ key, text, left: Math.max(EDGE, Math.min(rect.right - 200, window.innerWidth - BOX - EDGE)), top: rect.bottom - 2 });
    }

    /** 行に付ける。マウスだけに反応させる(タッチの疑似マウスで、行のタップのたびに開かないように)。 */
    function rowProps(key: string, text: string) {
        if (!text) return {};
        return {
            onPointerEnter: (event: PointerEvent<HTMLElement>) => { if (event.pointerType === 'mouse') open(key, text, event.currentTarget); },
            onPointerLeave: (event: PointerEvent<HTMLElement>) => { if (event.pointerType === 'mouse') setNote(null); },
        };
    }

    /** 中身のある行の印。タップで開閉し、行のクリック(編集)には伝えない。 */
    function mark(key: string, text: string, label: string): ReactNode {
        if (!text) return null;
        return (
            <Button
                color="ghost"
                size="icon"
                data-row-note
                aria-label={`${label} を表示`}
                aria-expanded={note?.key === key}
                onClick={event => {
                    event.stopPropagation();
                    if (note?.key === key) setNote(null);
                    else open(key, text, event.currentTarget.closest('tr') ?? event.currentTarget);
                }}
                className="-my-1 align-middle"
            >
                <MessageSquare className="w-4 h-4" />
            </Button>
        );
    }

    /**
     * 押せない印(計画の表用)。計画の行はタップで編集欄が開き、そこにメモが出るので、タッチ用の開閉ボタンは要らない。
     * 32px のボタンを名前の後ろに置くと狭い画面で表が横にはみ出すため、アイコンだけにする。
     */
    function hint(text: string): ReactNode {
        if (!text) return null;
        return (
            <>
                <MessageSquare aria-hidden="true" className="inline w-4 h-4 ml-1 -mt-0.5 text-neutral-500" />
                <span className="sr-only">メモ: {text}</span>
            </>
        );
    }

    const tooltip = note && (
        <div
            role="tooltip"
            className="fixed z-10 max-w-xs px-2 py-1 rounded-sm border border-neutral-200 bg-neutral-50 text-sm text-neutral-800 whitespace-pre-wrap pointer-events-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200"
            style={{ left: note.left, top: note.top }}
        >
            {note.text}
        </div>
    );

    return { rowProps, mark, hint, tooltip };
}
