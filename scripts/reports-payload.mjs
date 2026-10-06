/**
 * reports 同期の純粋関数群（DBアクセス・ファイルI/Oを含まない）。
 * テストで固定するのはここだけ。過去に置換方式の投入経路で実データを
 * 消した事故があり、集合演算（stale slug算出）や対象ファイルの絞り込みは
 * 回帰させてはならない境界のため、DBアクセスから切り離してある。
 */

const EXCLUDED_FILENAMES = new Set(['CLAUDE.md', '_index.md'])

/** reports直下の全ファイル名から、同期対象の.mdファイル名だけを残す。 */
export function filterReportFilenames(filenames) {
    return filenames
        .filter((name) => name.endsWith('.md'))
        .filter((name) => !EXCLUDED_FILENAMES.has(name))
        .sort()
}

/**
 * DB上のslug一覧のうち、ローカルに存在しないもの（=delete対象）を返す。
 * 「集合の一致」の要（ローカルに無いslugをdeleteする）そのものを担う関数。
 */
export function computeStaleSlugs(existingSlugs, localSlugs) {
    const local = new Set(localSlugs)
    return existingSlugs.filter((slug) => !local.has(slug))
}

/**
 * markdown中の他レポートへの相対リンク（`foo.md` 形式）を `/reports/foo` へ書き換える。
 * 外部URL・アンカーのみ・絶対パスは対象外。書き換え先のslugがローカルの同期対象に
 * 存在しない場合（archiveへ移動済み・削除済み等）は書き換えない
 * （壊れたリンクを別の壊れたリンクに置き換えても改善にならないため）。
 */
export function rewriteReportLinkUrl(url, localSlugs) {
    if (typeof url !== 'string' || url.length === 0) return url
    if (/^([a-z][a-z0-9+.-]*:)?\/\//i.test(url)) return url // 外部URL・プロトコル相対URL
    if (url.startsWith('#') || url.startsWith('/')) return url

    const [pathPart, ...hashParts] = url.split('#')
    if (!pathPart.endsWith('.md')) return url

    const slug = pathPart.slice(0, -3).replace(/^\.\//, '')
    if (slug.length === 0 || slug.includes('/') || !localSlugs.has(slug)) return url

    const hash = hashParts.length > 0 ? `#${hashParts.join('#')}` : ''
    return `/reports/${slug}${hash}`
}

/**
 * ルート直下の兄弟ノード(hast)を見出し単位で<section>にまとめる。
 * 見出しに出会うたびに新しいsectionを開始し、次の見出しまでの内容を含める。
 * 最初の見出しより前に本文があった場合もsectionでラップする（通常は無い）。
 */
export function sectionizeChildren(children) {
    const sections = []
    let current = null
    for (const node of children) {
        const isHeading = node.type === 'element' && /^h[1-6]$/.test(node.tagName)
        if (isHeading || !current) {
            current = { type: 'element', tagName: 'section', properties: {}, children: [] }
            sections.push(current)
        }
        current.children.push(node)
    }
    return sections
}
