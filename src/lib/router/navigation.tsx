import {
    createContext,
    useContext,
    useSyncExternalStore,
    type AnchorHTMLAttributes,
    type MouseEvent,
} from 'react'

/**
 * 自前のルーター(History API)のうち、ブラウザの URL を読み書きする部分。
 * ルート表と描画は src/router.tsx、パスの突き合わせは match.ts。
 * Next.js の `next/link`・`usePathname`・`useParams` の代わりで、使う側の形を合わせてある。
 */

const LOCATION_CHANGE_EVENT = 'monocore:locationchange'

function subscribe(onChange: () => void) {
    window.addEventListener('popstate', onChange)
    window.addEventListener(LOCATION_CHANGE_EVENT, onChange)
    return () => {
        window.removeEventListener('popstate', onChange)
        window.removeEventListener(LOCATION_CHANGE_EVENT, onChange)
    }
}

/** 今のパス(クエリ・ハッシュは含まない)。クエリが要る画面は window.location.search を直接読む。 */
export function usePathname(): string {
    return useSyncExternalStore(subscribe, () => window.location.pathname, () => '/')
}

/**
 * 画面を切り替える。ページは読み込み直さない。replace=true なら履歴に残さない。
 * push のときは先頭へスクロールする(通常のリンクの挙動に合わせる)。
 */
export function navigate(to: string, options: { replace?: boolean } = {}) {
    if (options.replace) {
        window.history.replaceState(null, '', to)
    } else {
        window.history.pushState(null, '', to)
        window.scrollTo(0, 0)
    }
    window.dispatchEvent(new Event(LOCATION_CHANGE_EVENT))
}

const RouteParamsContext = createContext<Record<string, string>>({})

/** ルート表(src/router.tsx)が、描画する画面を包んで今のルートのパラメータを渡す。 */
export const RouteParamsProvider = RouteParamsContext.Provider

export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
    return useContext(RouteParamsContext) as T
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }

/**
 * アプリ内のリンク。左クリックだけを奪って画面を切り替え、修飾キー付き・別タブ指定・
 * 中クリックは通常のリンクとしてブラウザに任せる(新しいタブで開ける)。
 */
export function Link({ href, onClick, target, ...rest }: LinkProps) {
    function handleClick(event: MouseEvent<HTMLAnchorElement>) {
        onClick?.(event)
        if (event.defaultPrevented) return
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        if (target && target !== '_self') return
        event.preventDefault()
        navigate(href)
    }

    return <a href={href} target={target} onClick={handleClick} {...rest} />
}
