import { describe, expect, it } from 'vitest'
import {
    getReportBySlug,
    getReportList,
    type ReportDetailRow,
    type ReportListRow,
} from './reports'
import { createSupabaseQueryStub } from './test-support'

describe('getReportList', () => {
    it('本文を除く一覧用の列を更新日時の降順で取得する', async () => {
        const response = {
            data: [{
                slug: 'weekly',
                title: '週報',
                updated_at: '2026-08-09T00:00:00.000Z',
                toc: [],
            }] satisfies ReportListRow[],
            error: null,
        }
        const { supabase, query } = createSupabaseQueryStub(
            'reports',
            ['select', 'order'],
            response,
        )

        await expect(getReportList(supabase)).resolves.toEqual(response)

        expect(supabase.from).toHaveBeenCalledWith('reports')
        expect(query.select).toHaveBeenCalledWith(
            'slug,title,updated_at,toc',
        )
        expect(query.order).toHaveBeenCalledWith(
            'updated_at',
            { ascending: false },
        )
    })

    it('空一覧でも本文を除く列を更新日時の降順で取得する', async () => {
        const response = {
            data: [] satisfies ReportListRow[],
            error: null,
        }
        const { supabase, query } = createSupabaseQueryStub(
            'reports',
            ['select', 'order'],
            response,
        )

        await expect(getReportList(supabase)).resolves.toEqual(response)

        expect(supabase.from).toHaveBeenCalledWith('reports')
        expect(query.select).toHaveBeenCalledWith(
            'slug,title,updated_at,toc',
        )
        expect(query.order).toHaveBeenCalledWith(
            'updated_at',
            { ascending: false },
        )
    })

    it('一覧取得エラー時も本文を除く列を更新日時の降順で取得する', async () => {
        const response = {
            data: null,
            error: {
                message: 'reports を取得できません',
                details: '',
                hint: '',
                code: '42501',
            },
        }
        const { supabase, query } = createSupabaseQueryStub(
            'reports',
            ['select', 'order'],
            response,
        )

        await expect(getReportList(supabase)).resolves.toEqual(response)

        expect(supabase.from).toHaveBeenCalledWith('reports')
        expect(query.select).toHaveBeenCalledWith(
            'slug,title,updated_at,toc',
        )
        expect(query.order).toHaveBeenCalledWith(
            'updated_at',
            { ascending: false },
        )
    })
})

describe('getReportBySlug', () => {
    it('空文字の slug もそのまま条件に渡して単一レポートを取得する', async () => {
        const response = {
            data: {
                slug: '',
                title: '無題',
                body_html: '<p>本文</p>',
                toc: [],
                updated_at: '2026-08-09T00:00:00.000Z',
            } satisfies ReportDetailRow,
            error: null,
        }
        const { supabase, query } = createSupabaseQueryStub(
            'reports',
            ['select', 'eq', 'maybeSingle'],
            response,
        )

        await expect(
            getReportBySlug(supabase, ''),
        ).resolves.toEqual(response)

        expect(supabase.from).toHaveBeenCalledWith('reports')
        expect(query.select).toHaveBeenCalledWith(
            'slug,title,body_html,toc,updated_at',
        )
        expect(query.eq).toHaveBeenCalledWith('slug', '')
        expect(query.maybeSingle).toHaveBeenCalledWith()
    })

    it('対象がない場合も指定 slug で単一レポートを取得する', async () => {
        const response = { data: null, error: null }
        const { supabase, query } = createSupabaseQueryStub(
            'reports',
            ['select', 'eq', 'maybeSingle'],
            response,
        )

        await expect(
            getReportBySlug(supabase, 'missing'),
        ).resolves.toEqual(response)

        expect(supabase.from).toHaveBeenCalledWith('reports')
        expect(query.select).toHaveBeenCalledWith(
            'slug,title,body_html,toc,updated_at',
        )
        expect(query.eq).toHaveBeenCalledWith('slug', 'missing')
        expect(query.maybeSingle).toHaveBeenCalledWith()
    })

    it('取得エラー時も指定 slug で単一レポートを取得する', async () => {
        const response = {
            data: null,
            error: {
                message: 'report を取得できません',
                details: '',
                hint: '',
                code: '42501',
            },
        }
        const { supabase, query } = createSupabaseQueryStub(
            'reports',
            ['select', 'eq', 'maybeSingle'],
            response,
        )

        await expect(
            getReportBySlug(supabase, 'weekly'),
        ).resolves.toEqual(response)

        expect(supabase.from).toHaveBeenCalledWith('reports')
        expect(query.select).toHaveBeenCalledWith(
            'slug,title,body_html,toc,updated_at',
        )
        expect(query.eq).toHaveBeenCalledWith('slug', 'weekly')
        expect(query.maybeSingle).toHaveBeenCalledWith()
    })
})
