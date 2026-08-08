import { describe, expect, it } from 'vitest'
import {
    computeStaleSlugs,
    filterReportFilenames,
    rewriteReportLinkUrl,
    sectionizeChildren,
} from './reports-payload.mjs'

describe('filterReportFilenames', () => {
    it('keeps only .md files', () => {
        expect(filterReportFilenames(['a.md', 'b.txt', 'c.png'])).toEqual(['a.md'])
    })

    it('excludes CLAUDE.md and _index.md', () => {
        expect(filterReportFilenames(['a.md', 'CLAUDE.md', '_index.md', 'b.md'])).toEqual([
            'a.md',
            'b.md',
        ])
    })

    it('sorts the result', () => {
        expect(filterReportFilenames(['zeta.md', 'alpha.md'])).toEqual(['alpha.md', 'zeta.md'])
    })

    it('returns an empty array when nothing is left', () => {
        expect(filterReportFilenames(['CLAUDE.md', '_index.md'])).toEqual([])
        expect(filterReportFilenames([])).toEqual([])
    })
})

describe('computeStaleSlugs', () => {
    it('returns DB slugs that are not present locally', () => {
        expect(computeStaleSlugs(['a', 'b', 'c'], ['a', 'c'])).toEqual(['b'])
    })

    it('returns an empty array when every DB slug is still local (no accidental deletes)', () => {
        expect(computeStaleSlugs(['a', 'b'], ['a', 'b', 'c'])).toEqual([])
    })

    it('treats an empty DB as nothing to delete', () => {
        expect(computeStaleSlugs([], ['a', 'b'])).toEqual([])
    })

    it('marks every DB row stale when local is empty (caller must guard against this separately)', () => {
        expect(computeStaleSlugs(['a', 'b'], [])).toEqual(['a', 'b'])
    })
})

describe('rewriteReportLinkUrl', () => {
    const localSlugs = new Set(['product_sales_roadmap', 'simplicity'])

    it('rewrites a relative .md link to a known local slug', () => {
        expect(rewriteReportLinkUrl('product_sales_roadmap.md', localSlugs)).toBe(
            '/reports/product_sales_roadmap'
        )
    })

    it('rewrites a ./ prefixed relative link', () => {
        expect(rewriteReportLinkUrl('./simplicity.md', localSlugs)).toBe('/reports/simplicity')
    })

    it('preserves a trailing hash fragment', () => {
        expect(rewriteReportLinkUrl('simplicity.md#section-2', localSlugs)).toBe(
            '/reports/simplicity#section-2'
        )
    })

    it('leaves links to files outside the synced set untouched (e.g. archived reports)', () => {
        expect(rewriteReportLinkUrl('archived_report.md', localSlugs)).toBe('archived_report.md')
    })

    it('leaves external URLs untouched', () => {
        expect(rewriteReportLinkUrl('https://example.com/x.md', localSlugs)).toBe(
            'https://example.com/x.md'
        )
        expect(rewriteReportLinkUrl('//example.com/x.md', localSlugs)).toBe('//example.com/x.md')
    })

    it('leaves anchor-only and absolute links untouched', () => {
        expect(rewriteReportLinkUrl('#some-anchor', localSlugs)).toBe('#some-anchor')
        expect(rewriteReportLinkUrl('/reports/simplicity', localSlugs)).toBe('/reports/simplicity')
    })

    it('leaves non-.md relative links untouched', () => {
        expect(rewriteReportLinkUrl('image.png', localSlugs)).toBe('image.png')
    })

    it('leaves links into subdirectories (e.g. archive/) untouched', () => {
        expect(rewriteReportLinkUrl('archive/simplicity.md', localSlugs)).toBe('archive/simplicity.md')
    })

    it('passes through non-string input unchanged', () => {
        expect(rewriteReportLinkUrl(undefined, localSlugs)).toBe(undefined)
        expect(rewriteReportLinkUrl('', localSlugs)).toBe('')
    })
})

describe('sectionizeChildren', () => {
    function heading(tagName) {
        return { type: 'element', tagName, properties: {}, children: [] }
    }
    function paragraph() {
        return { type: 'element', tagName: 'p', properties: {}, children: [] }
    }

    it('starts a new section at every heading', () => {
        const children = [heading('h1'), paragraph(), heading('h2'), paragraph(), paragraph()]
        const sections = sectionizeChildren(children)
        expect(sections).toHaveLength(2)
        expect(sections[0].tagName).toBe('section')
        expect(sections[0].children).toEqual([children[0], children[1]])
        expect(sections[1].children).toEqual([children[2], children[3], children[4]])
    })

    it('wraps leading content before the first heading in its own section', () => {
        const children = [paragraph(), heading('h2'), paragraph()]
        const sections = sectionizeChildren(children)
        expect(sections).toHaveLength(2)
        expect(sections[0].children).toEqual([children[0]])
        expect(sections[1].children).toEqual([children[1], children[2]])
    })

    it('returns an empty array for empty input', () => {
        expect(sectionizeChildren([])).toEqual([])
    })

    it('wraps a document with no headings in a single section', () => {
        const children = [paragraph(), paragraph()]
        const sections = sectionizeChildren(children)
        expect(sections).toHaveLength(1)
        expect(sections[0].children).toEqual(children)
    })
})
