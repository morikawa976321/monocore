import { lazy, Suspense, type ComponentType } from 'react'
import { matchPath } from '@/src/lib/router/match'
import { Link, RouteParamsProvider, usePathname } from '@/src/lib/router/navigation'

/**
 * ルート表。URL と画面(`src/app/**\/page.tsx` の default export)の対応で、Next.js のフォルダ規約の代わり。
 * 画面ごとに読み込みを分けるので、開いた画面の分だけ JS を取る。新しい画面はここに 1 行足す。
 * 一致は上から順に見る(今のパスに重なるものは無い)。
 */
const ROUTES: { path: string; component: ComponentType }[] = [
    { path: '/', component: lazy(() => import('@/src/app/page')) },
    { path: '/schedules', component: lazy(() => import('@/src/app/schedules/page')) },
    { path: '/finance', component: lazy(() => import('@/src/app/finance/page')) },
    { path: '/news', component: lazy(() => import('@/src/app/news/page')) },
    { path: '/weather', component: lazy(() => import('@/src/app/weather/page')) },
    { path: '/reports', component: lazy(() => import('@/src/app/reports/page')) },
    { path: '/reports/:slug', component: lazy(() => import('@/src/app/reports/[slug]/page')) },
    { path: '/login', component: lazy(() => import('@/src/app/login/page')) },
    { path: '/auth/callback', component: lazy(() => import('@/src/app/auth/callback/page')) },
]

export function Routes() {
    const pathname = usePathname()

    for (const route of ROUTES) {
        const params = matchPath(route.path, pathname)
        if (params) {
            const Page = route.component
            return (
                <RouteParamsProvider value={params}>
                    <Suspense fallback={null}>
                        <Page />
                    </Suspense>
                </RouteParamsProvider>
            )
        }
    }
    return <NotFound />
}

function NotFound() {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-4">
            <p className="text-neutral-900 dark:text-neutral-100">ページが見つかりません。</p>
            <Link
                href="/"
                className="underline text-neutral-700 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-50"
            >
                トップへ
            </Link>
        </div>
    )
}
