import { describe, expect, it } from 'vitest'
import {
    computeStaleSlugs,
    filterReportFilenames,
    rewriteReportLinkUrl,
    sectionizeChildren,
} from './reports-payload.mjs'

describe('filterReportFilenames', () => {
    it('keeps .md files, excludes CLAUDE/_index, and sorts', () => {
        expect(
            filterReportFilenames(['zeta.md', 'CLAUDE.md', '_index.md', 'b.txt', 'alpha.md'])
        ).toEqual(['alpha.md', 'zeta.md'])
        expect(filterReportFilenames(['CLAUDE.md'])).toEqual([])
    })
})

describe('computeStaleSlugs', () => {
    it('returns DB-only slugs; empty when nothing is stale', () => {
        expect(computeStaleSlugs(['a', 'b', 'c'], ['a', 'c'])).toEqual(['b'])
        expect(computeStaleSlugs(['a', 'b'], ['a', 'b', 'c'])).toEqual([])
        expect(computeStaleSlugs(['a', 'b'], [])).toEqual(['a', 'b'])
    })
})

describe('rewriteReportLinkUrl', () => {
    const localSlugs = new Set(['product_sales_roadmap', 'simplicity'])

    it('rewrites relative .md links to known local slugs', () => {
        expect(rewriteReportLinkUrl('product_sales_roadmap.md', localSlugs)).toBe(
            '/reports/product_sales_roadmap'
        )
        expect(rewriteReportLinkUrl('./simplicity.md#section-2', localSlugs)).toBe(
            '/reports/simplicity#section-2'
        )
    })

    it('leaves external and unknown links untouched', () => {
        expect(rewriteReportLinkUrl('https://example.com/x.md', localSlugs)).toBe(
            'https://example.com/x.md'
        )
        expect(rewriteReportLinkUrl('archived_report.md', localSlugs)).toBe('archived_report.md')
        expect(rewriteReportLinkUrl('archive/simplicity.md', localSlugs)).toBe(
            'archive/simplicity.md'
        )
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
        const children = [heading('h1'), paragraph(), heading('h2'), paragraph()]
        const sections = sectionizeChildren(children)
        expect(sections).toHaveLength(2)
        expect(sections[0].children).toEqual([children[0], children[1]])
        expect(sections[1].children).toEqual([children[2], children[3]])
    })

    it('wraps leading content or heading-less docs in a section', () => {
        const leading = [paragraph(), heading('h2'), paragraph()]
        expect(sectionizeChildren(leading)).toHaveLength(2)
        expect(sectionizeChildren([paragraph(), paragraph()])).toHaveLength(1)
        expect(sectionizeChildren([])).toEqual([])
    })
})
