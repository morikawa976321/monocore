import type { SupabaseClient } from '@supabase/supabase-js'
import { vi } from 'vitest'
import type { Database } from '../../../types/database.types'

export type QueryStub = Record<string, ReturnType<typeof vi.fn>>

export function createQueryStub<TResponse>(
    methods: readonly string[],
    response: TResponse,
): QueryStub {
    if (methods.length === 0) {
        throw new Error('クエリチェーンには1つ以上のメソッドが必要です')
    }

    const query: QueryStub = {}

    methods.forEach((method, index) => {
        const stub = query[method] ?? vi.fn()
        query[method] = stub

        if (index === methods.length - 1) {
            stub.mockResolvedValueOnce(response)
        } else {
            stub.mockImplementationOnce(() => query)
        }
    })

    return query
}

export function createSupabaseQueryStub<TResponse>(
    table: keyof Database['public']['Tables'],
    methods: readonly string[],
    response: TResponse,
) {
    const query = createQueryStub(methods, response)
    const from = vi.fn((requestedTable: string) => {
        if (requestedTable !== table) {
            throw new Error(`期待しないテーブルです: ${requestedTable}`)
        }
        return query
    })
    const supabase = { from } as unknown as SupabaseClient<Database>

    return { supabase, query }
}
