import { Component, type ReactNode } from 'react'
import { Button } from '@/src/components/ui/Button'

type RouteErrorBoundaryProps = { children: ReactNode }
type RouteErrorBoundaryState = { failed: boolean }

/**
 * 画面の読み込み・描画の失敗を受け止めて、枠(サイドバーなど)を残したまま知らせる。
 *
 * 画面は src/router.tsx で `lazy` 読み込みにしてあり、読み込みに失敗すると(通信が切れた、新しいデプロイのあとで
 * 古い画面が指すファイルが無くなった、など)その例外が React のルートまで伝わって、アプリ全体が空白になる。
 * ここで止めれば、サイドバーから別の画面へ移れるし、読み込み直しもできる。呼び出し側が `key` に今のパスを
 * 渡しているので、別の画面へ移ると失敗の表示は消える。
 *
 * エラー境界はクラスコンポーネントでしか書けない(AGENTS.md の関数宣言の規約の例外)。
 */
export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
    state: RouteErrorBoundaryState = { failed: false }

    static getDerivedStateFromError(): RouteErrorBoundaryState {
        return { failed: true }
    }

    componentDidCatch(error: Error) {
        console.error(error)
    }

    render() {
        if (!this.state.failed) return this.props.children

        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-4">
                <p className="text-neutral-900 dark:text-neutral-100">画面を読み込めませんでした。</p>
                <Button color="primary" size="md" onClick={() => window.location.reload()}>
                    読み込み直す
                </Button>
            </div>
        )
    }
}
