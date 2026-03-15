import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database.types'
import { getSchedules, replaceSchedulesForDay } from './schedules'

function createMockSupabase() {
    const chain = {
        select: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        order: vi.fn(),
    }
    const from = vi.fn().mockReturnValue(chain)
    const rpc = vi.fn()

    return {
        from,
        rpc,
        chain,
        _setSelectResult: (data: unknown, error: unknown = null) => {
            chain.order.mockResolvedValueOnce({ data, error })
        },
        _setRpcResult: (error: unknown = null) => {
            rpc.mockResolvedValueOnce({ data: undefined, error })
        },
    } as unknown as SupabaseClient<Database> & {
        chain: typeof chain
        _setSelectResult: (data: unknown, error?: unknown) => void
        _setRpcResult: (error?: unknown) => void
    }
}

describe('getSchedules', () => {
    it('calls supabase with start_at and end_at and returns data', async () => {
        const supabase = createMockSupabase()
        const mockRows = [
            {
                id: 'id-1',
                user_id: 'user-1',
                activity: 'meeting',
                start_at: '2026-03-15T00:30:00.000Z',
                end_at: '2026-03-15T01:30:00.000Z',
                created_at: null,
                updated_at: null,
            },
        ]
        supabase._setSelectResult(mockRows)

        const result = await getSchedules(supabase, {
            start_at: '2026-03-15T00:00:00.000Z',
            end_at: '2026-03-16T00:00:00.000Z',
        })

        expect(supabase.from).toHaveBeenCalledWith('schedules')
        expect(supabase.chain.select).toHaveBeenCalledWith('*')
        expect(supabase.chain.gte).toHaveBeenCalledWith(
            'start_at',
            '2026-03-15T00:00:00.000Z'
        )
        expect(supabase.chain.lt).toHaveBeenCalledWith(
            'start_at',
            '2026-03-16T00:00:00.000Z'
        )
        expect(supabase.chain.order).toHaveBeenCalledWith('start_at', {
            ascending: true,
        })
        expect(result.data).toEqual(mockRows)
        expect(result.error).toBeNull()
    })

    it('returns error when supabase returns error', async () => {
        const supabase = createMockSupabase()
        const mockError = new Error('network error')
        supabase._setSelectResult(null, mockError)

        const result = await getSchedules(supabase, {
            start_at: '2026-03-15T00:00:00.000Z',
            end_at: '2026-03-16T00:00:00.000Z',
        })

        expect(result.data).toBeNull()
        expect(result.error).toBe(mockError)
    })

})

describe('replaceSchedulesForDay', () => {
    it('calls RPC with given UTC params', async () => {
        const supabase = createMockSupabase()
        supabase._setRpcResult(null)

        const result = await replaceSchedulesForDay(
            supabase,
            '2026-03-14T15:00:00.000Z',
            '2026-03-15T15:00:00.000Z',
            [
                {
                    activity: 'meeting',
                    start_at: '2026-03-15T00:30:00.000Z',
                    end_at: '2026-03-15T01:30:00.000Z',
                },
                {
                    activity: 'lunch',
                    start_at: '2026-03-15T03:00:00.000Z',
                    end_at: null,
                },
            ]
        )

        expect(supabase.rpc).toHaveBeenCalledWith('replace_schedules_for_day', {
            p_day_start_utc: '2026-03-14T15:00:00.000Z',
            p_day_end_utc: '2026-03-15T15:00:00.000Z',
            p_items: [
                {
                    activity: 'meeting',
                    start_at: '2026-03-15T00:30:00.000Z',
                    end_at: '2026-03-15T01:30:00.000Z',
                },
                {
                    activity: 'lunch',
                    start_at: '2026-03-15T03:00:00.000Z',
                    end_at: null,
                },
            ],
        })
        expect(result.error).toBeNull()
    })

    it('returns error when RPC returns error', async () => {
        const supabase = createMockSupabase()
        const mockError = new Error('Not authenticated')
        supabase._setRpcResult(mockError)

        const result = await replaceSchedulesForDay(
            supabase,
            '2026-03-15T00:00:00.000Z',
            '2026-03-16T00:00:00.000Z',
            [{ activity: 'x', start_at: '2026-03-15T00:00:00.000Z', end_at: null }]
        )

        expect(result.error).toBe(mockError)
    })
})
