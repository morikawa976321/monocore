import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import type { Database } from '../../../types/database.types'
import {
    getScheduleDayRevisions,
    getSchedules,
    replaceSchedulesForDay,
} from './schedules'
import { createSupabaseQueryStub } from './test-support'

type ScheduleRow = Database['public']['Tables']['schedules']['Row']
type ScheduleDayRevisionRow =
    Database['public']['Tables']['schedule_day_revisions']['Row']

describe('getSchedules', () => {
    it('開始時刻が範囲内の予定を開始時刻の昇順で取得する', async () => {
        const response = {
            data: [{
                id: 'schedule-1',
                activity: '作業',
                start_at: '2026-08-09T00:00:00.000Z',
                end_at: null,
                created_at: '2026-08-09T00:00:00.000Z',
                updated_at: '2026-08-09T00:00:00.000Z',
                updated_by: 'user-1',
                user_id: 'user-1',
            }] satisfies ScheduleRow[],
            error: null,
        }
        const { supabase, query } = createSupabaseQueryStub(
            'schedules',
            ['select', 'gte', 'lt', 'order'],
            response,
        )

        await expect(
            getSchedules(
                supabase,
                '2026-08-09T00:00:00.000Z',
                '2026-08-10T00:00:00.000Z',
            ),
        ).resolves.toEqual(response)

        expect(supabase.from).toHaveBeenCalledWith('schedules')
        expect(query.select).toHaveBeenCalledWith('*')
        expect(query.gte).toHaveBeenCalledWith(
            'start_at',
            '2026-08-09T00:00:00.000Z',
        )
        expect(query.lt).toHaveBeenCalledWith(
            'start_at',
            '2026-08-10T00:00:00.000Z',
        )
        expect(query.order).toHaveBeenCalledWith(
            'start_at',
            { ascending: true },
        )
    })

    it('空の開始値と終了値も半開区間の条件として渡す', async () => {
        const response = {
            data: [] satisfies ScheduleRow[],
            error: null,
        }
        const { supabase, query } = createSupabaseQueryStub(
            'schedules',
            ['select', 'gte', 'lt', 'order'],
            response,
        )

        await expect(
            getSchedules(supabase, '', ''),
        ).resolves.toEqual(response)

        expect(supabase.from).toHaveBeenCalledWith('schedules')
        expect(query.select).toHaveBeenCalledWith('*')
        expect(query.gte).toHaveBeenCalledWith('start_at', '')
        expect(query.lt).toHaveBeenCalledWith('start_at', '')
        expect(query.order).toHaveBeenCalledWith(
            'start_at',
            { ascending: true },
        )
    })

    it('取得エラー時も指定値を半開区間の条件として渡す', async () => {
        const error = new Error('schedules を取得できません')
        const response = { data: null, error }
        const { supabase, query } = createSupabaseQueryStub(
            'schedules',
            ['select', 'gte', 'lt', 'order'],
            response,
        )

        await expect(
            getSchedules(supabase, 'start', 'end'),
        ).resolves.toEqual(response)

        expect(supabase.from).toHaveBeenCalledWith('schedules')
        expect(query.select).toHaveBeenCalledWith('*')
        expect(query.gte).toHaveBeenCalledWith('start_at', 'start')
        expect(query.lt).toHaveBeenCalledWith('start_at', 'end')
        expect(query.order).toHaveBeenCalledWith(
            'start_at',
            { ascending: true },
        )
    })
})

describe('getScheduleDayRevisions', () => {
    it('日付範囲を両端を含めて revision を取得する', async () => {
        const response = {
            data: [{
                user_id: 'user-1',
                day_key: '2026-08-09',
                revision: 3,
                updated_at: '2026-08-09T00:00:00.000Z',
            }] satisfies ScheduleDayRevisionRow[],
            error: null,
        }
        const { supabase, query } = createSupabaseQueryStub(
            'schedule_day_revisions',
            ['select', 'gte', 'lte', 'order'],
            response,
        )

        await expect(
            getScheduleDayRevisions(
                supabase,
                '2026-08-01',
                '2026-08-31',
            ),
        ).resolves.toEqual(response)

        expect(supabase.from).toHaveBeenCalledWith(
            'schedule_day_revisions',
        )
        expect(query.select).toHaveBeenCalledWith('*')
        expect(query.gte).toHaveBeenCalledWith('day_key', '2026-08-01')
        expect(query.lte).toHaveBeenCalledWith('day_key', '2026-08-31')
        expect(query.order).toHaveBeenCalledWith(
            'day_key',
            { ascending: true },
        )
    })

    it('revision がない場合も指定範囲を両端の条件として渡す', async () => {
        const response = {
            data: [] satisfies ScheduleDayRevisionRow[],
            error: null,
        }
        const { supabase, query } = createSupabaseQueryStub(
            'schedule_day_revisions',
            ['select', 'gte', 'lte', 'order'],
            response,
        )

        await expect(
            getScheduleDayRevisions(
                supabase,
                '2026-09-01',
                '2026-09-30',
            ),
        ).resolves.toEqual(response)

        expect(supabase.from).toHaveBeenCalledWith(
            'schedule_day_revisions',
        )
        expect(query.select).toHaveBeenCalledWith('*')
        expect(query.gte).toHaveBeenCalledWith('day_key', '2026-09-01')
        expect(query.lte).toHaveBeenCalledWith('day_key', '2026-09-30')
        expect(query.order).toHaveBeenCalledWith(
            'day_key',
            { ascending: true },
        )
    })

    it('revision 取得エラー時も指定範囲を両端の条件として渡す', async () => {
        const response = {
            data: null,
            error: {
                message: 'revisions を取得できません',
                details: '',
                hint: '',
                code: '42501',
            },
        }
        const { supabase, query } = createSupabaseQueryStub(
            'schedule_day_revisions',
            ['select', 'gte', 'lte', 'order'],
            response,
        )

        await expect(
            getScheduleDayRevisions(
                supabase,
                '2026-08-01',
                '2026-08-31',
            ),
        ).resolves.toEqual(response)

        expect(supabase.from).toHaveBeenCalledWith(
            'schedule_day_revisions',
        )
        expect(query.select).toHaveBeenCalledWith('*')
        expect(query.gte).toHaveBeenCalledWith('day_key', '2026-08-01')
        expect(query.lte).toHaveBeenCalledWith('day_key', '2026-08-31')
        expect(query.order).toHaveBeenCalledWith(
            'day_key',
            { ascending: true },
        )
    })
})

describe('replaceSchedulesForDay', () => {
    it('空配列を含む日次置換を RPC に渡す', async () => {
        const response = { data: 4, error: null }
        const rpc = vi.fn().mockResolvedValue(response)
        const supabase = { rpc } as unknown as SupabaseClient<Database>

        await expect(
            replaceSchedulesForDay(
                supabase,
                '2026-08-09',
                '2026-08-08T15:00:00.000Z',
                '2026-08-09T15:00:00.000Z',
                3,
                [],
            ),
        ).resolves.toEqual(response)

        expect(rpc).toHaveBeenCalledWith('replace_schedules_for_day', {
            p_day_key: '2026-08-09',
            p_day_start_utc: '2026-08-08T15:00:00.000Z',
            p_day_end_utc: '2026-08-09T15:00:00.000Z',
            p_expected_revision: 3,
            p_items: [],
        })
    })

    it('非空の予定データ配列を RPC にそのまま渡す', async () => {
        const response = { data: 4, error: null }
        const rpc = vi.fn().mockResolvedValue(response)
        const supabase = { rpc } as unknown as SupabaseClient<Database>
        const items = [
            {
                activity: '朝会',
                start_at: '2026-08-09T00:00:00.000Z',
                end_at: '2026-08-09T00:30:00.000Z',
            },
            {
                activity: '資料作成',
                start_at: '2026-08-09T01:00:00.000Z',
                end_at: null,
            },
        ]

        await expect(
            replaceSchedulesForDay(
                supabase,
                '2026-08-09',
                '2026-08-08T15:00:00.000Z',
                '2026-08-09T15:00:00.000Z',
                3,
                items,
            ),
        ).resolves.toEqual(response)

        expect(rpc).toHaveBeenCalledWith('replace_schedules_for_day', {
            p_day_key: '2026-08-09',
            p_day_start_utc: '2026-08-08T15:00:00.000Z',
            p_day_end_utc: '2026-08-09T15:00:00.000Z',
            p_expected_revision: 3,
            p_items: items,
        })
    })

    it('RPC エラー時も日次置換の全引数を渡す', async () => {
        const error = {
            message: '競合しました',
            details: '',
            hint: '',
            code: 'P0001',
        }
        const response = { data: null, error }
        const rpc = vi.fn().mockResolvedValue(response)
        const supabase = { rpc } as unknown as SupabaseClient<Database>

        await expect(
            replaceSchedulesForDay(
                supabase,
                '2026-08-09',
                'start',
                'end',
                3,
                [],
            ),
        ).resolves.toEqual(response)

        expect(rpc).toHaveBeenCalledWith('replace_schedules_for_day', {
            p_day_key: '2026-08-09',
            p_day_start_utc: 'start',
            p_day_end_utc: 'end',
            p_expected_revision: 3,
            p_items: [],
        })
    })
})
