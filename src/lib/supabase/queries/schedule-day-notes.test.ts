import { describe, expect, it } from 'vitest'
import type { Database } from '../../../types/database.types'
import {
    getScheduleDayNotes,
    upsertScheduleDayNote,
} from './schedule-day-notes'
import { createSupabaseQueryStub } from './test-support'

type ScheduleDayNoteRow =
    Database['public']['Tables']['schedule_day_notes']['Row']

describe('getScheduleDayNotes', () => {
    it('指定範囲を両端を含めて day_key 昇順で取得する', async () => {
        const response = {
            data: [{
                user_id: 'user-1',
                day_key: '2026-08-09',
                body: 'メモ',
                created_at: '2026-08-09T00:00:00.000Z',
                updated_at: '2026-08-09T00:00:00.000Z',
            }] satisfies ScheduleDayNoteRow[],
            error: null,
        }
        const { supabase, query } = createSupabaseQueryStub(
            'schedule_day_notes',
            ['select', 'gte', 'lte', 'order'],
            response,
        )

        await expect(
            getScheduleDayNotes(supabase, '2026-08-01', '2026-08-31'),
        ).resolves.toEqual(response)

        expect(supabase.from).toHaveBeenCalledWith('schedule_day_notes')
        expect(query.select).toHaveBeenCalledWith('*')
        expect(query.gte).toHaveBeenCalledWith('day_key', '2026-08-01')
        expect(query.lte).toHaveBeenCalledWith('day_key', '2026-08-31')
        expect(query.order).toHaveBeenCalledWith(
            'day_key',
            { ascending: true },
        )
    })

    it('空の境界値も両端の範囲条件として渡す', async () => {
        const response = {
            data: [] satisfies ScheduleDayNoteRow[],
            error: null,
        }
        const { supabase, query } = createSupabaseQueryStub(
            'schedule_day_notes',
            ['select', 'gte', 'lte', 'order'],
            response,
        )

        await expect(
            getScheduleDayNotes(supabase, '', ''),
        ).resolves.toEqual(response)

        expect(supabase.from).toHaveBeenCalledWith('schedule_day_notes')
        expect(query.select).toHaveBeenCalledWith('*')
        expect(query.gte).toHaveBeenCalledWith('day_key', '')
        expect(query.lte).toHaveBeenCalledWith('day_key', '')
        expect(query.order).toHaveBeenCalledWith(
            'day_key',
            { ascending: true },
        )
    })

    it('取得エラー時も指定範囲を両端の条件として渡す', async () => {
        const response = {
            data: null,
            error: {
                message: 'day notes を取得できません',
                details: '',
                hint: '',
                code: '42501',
            },
        }
        const { supabase, query } = createSupabaseQueryStub(
            'schedule_day_notes',
            ['select', 'gte', 'lte', 'order'],
            response,
        )

        await expect(
            getScheduleDayNotes(supabase, '2026-08-01', '2026-08-31'),
        ).resolves.toEqual(response)

        expect(supabase.from).toHaveBeenCalledWith('schedule_day_notes')
        expect(query.select).toHaveBeenCalledWith('*')
        expect(query.gte).toHaveBeenCalledWith('day_key', '2026-08-01')
        expect(query.lte).toHaveBeenCalledWith('day_key', '2026-08-31')
        expect(query.order).toHaveBeenCalledWith(
            'day_key',
            { ascending: true },
        )
    })
})

describe('upsertScheduleDayNote', () => {
    it('空本文を日付と user_id の複合競合キーで upsert する', async () => {
        const response = { error: null }
        const { supabase, query } = createSupabaseQueryStub(
            'schedule_day_notes',
            ['upsert'],
            response,
        )

        await expect(
            upsertScheduleDayNote(supabase, '2026-08-09', ''),
        ).resolves.toEqual(response)

        expect(supabase.from).toHaveBeenCalledWith('schedule_day_notes')
        expect(query.upsert).toHaveBeenCalledWith(
            { day_key: '2026-08-09', body: '' },
            { onConflict: 'user_id,day_key' },
        )
    })

    it('upsert エラー時も日付と本文を複合競合キーで保存する', async () => {
        const error = {
            message: 'day note を保存できません',
            details: '',
            hint: '',
            code: '42501',
        }
        const response = { error }
        const { supabase, query } = createSupabaseQueryStub(
            'schedule_day_notes',
            ['upsert'],
            response,
        )

        await expect(
            upsertScheduleDayNote(supabase, '2026-08-09', '内容'),
        ).resolves.toEqual(response)

        expect(supabase.from).toHaveBeenCalledWith('schedule_day_notes')
        expect(query.upsert).toHaveBeenCalledWith(
            { day_key: '2026-08-09', body: '内容' },
            { onConflict: 'user_id,day_key' },
        )
    })
})
