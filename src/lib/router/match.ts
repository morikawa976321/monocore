/**
 * パスとルート(`/reports/:slug` の形)の突き合わせ。ルーターのうち副作用の無い部分で、
 * ブラウザの状態を読む側(navigation.tsx)から分けてある。
 *
 * - 末尾のスラッシュは無視する(`/reports/` は `/reports`)。
 * - `:name` は 1 セグメントに一致し、値は URL デコードして返す。デコードできないものは一致しない扱い。
 * - ワイルドカードは持たない(今のルートに要らない)。
 */
export function matchPath(pattern: string, pathname: string): Record<string, string> | null {
    const patternSegments = splitPath(pattern)
    const pathSegments = splitPath(pathname)
    if (patternSegments.length !== pathSegments.length) return null

    const params: Record<string, string> = {}
    for (let i = 0; i < patternSegments.length; i++) {
        const expected = patternSegments[i]
        const actual = pathSegments[i]
        if (expected.startsWith(':')) {
            try {
                params[expected.slice(1)] = decodeURIComponent(actual)
            } catch {
                return null
            }
        } else if (expected !== actual) {
            return null
        }
    }
    return params
}

function splitPath(path: string): string[] {
    return path.split('/').filter((segment) => segment !== '')
}
