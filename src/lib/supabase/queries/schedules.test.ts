import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import type { Database } from '../../../types/database.types'
import { getDefaultAppliedDays, PAGE_ROWS } from './schedules'

/**
 * PostgREST の挙動だけを真似た偽の接続。.range(from, to) と count: 'exact' に、サーバーの max_rows で
 * 切った応答を返す。チェーンの形は検査しない(どのメソッドも自分を返す)。数えるのは「何回問い合わせたか」と
 * 「どの日が取れたか」だけ。
 */
function fakeSupabase(
    dayKeys: string[],
    maxRows: number,
    failAtRequest?: number,
    afterRequest?: (requestNumber: number, keys: string[]) => void,
) {
    let requests = 0
    const client = {
        from() {
            let from = 0
            let to = Number.POSITIVE_INFINITY
            const query: Record<string, unknown> = new Proxy(
                {},
                {
                    get(_target, prop) {
                        if (prop === 'range') {
                            return (a: number, b: number) => {
                                from = a
                                to = b
                                return query
                            }
                        }
                        if (prop === 'then') {
                            return (resolve: (value: unknown) => void) => {
                                requests += 1
                                if (requests === failAtRequest) {
                                    resolve({ data: null, error: { message: 'boom' }, count: null })
                                    return
                                }
                                // 総数が分かっていて、範囲の始まりが総数以上のとき、PostgREST は 416 を返す。
                                if (dayKeys.length > 0 && from >= dayKeys.length) {
                                    resolve({
                                        data: null,
                                        error: { code: 'PGRST103', message: 'Requested range not satisfiable' },
                                        count: null,
                                    })
                                    afterRequest?.(requests, dayKeys)
                                    return
                                }
                                const end = Math.min(to + 1, from + maxRows)
                                resolve({
                                    data: dayKeys.slice(from, end).map((day_key) => ({ day_key })),
                                    error: null,
                                    count: dayKeys.length,
                                })
                                afterRequest?.(requests, dayKeys)
                            }
                        }
                        return () => query
                    },
                },
            )
            return query
        },
    }
    return { supabase: client as unknown as SupabaseClient<Database>, requestCount: () => requests }
}

function rowsOf(days: number, perDay: number): string[] {
    const keys: string[] = []
    for (let d = 0; d < days; d++) {
        const day = `2026-12-${String(d + 1).padStart(2, '0')}`
        for (let i = 0; i < perDay; i++) keys.push(day)
    }
    return keys
}

describe('getDefaultAppliedDays', () => {
    it('1ページに収まる分は1回の問い合わせで読み切る(空のページを読みに行かない)', async () => {
        const { supabase, requestCount } = fakeSupabase(rowsOf(30, 3), 1000)
        const { data, error } = await getDefaultAppliedDays(supabase, '2026-12-01', '2026-12-30')
        expect(error).toBeNull()
        expect(data?.size).toBe(30)
        expect(requestCount()).toBe(1)
    })

    it('記録が無いときは空の集合を返す', async () => {
        const { supabase, requestCount } = fakeSupabase([], 1000)
        const { data } = await getDefaultAppliedDays(supabase, '2026-12-01', '2026-12-30')
        expect(data?.size).toBe(0)
        expect(requestCount()).toBe(1)
    })

    it('ちょうど PAGE_ROWS 行でも、空のページを読みに行かない', async () => {
        const { supabase, requestCount } = fakeSupabase(rowsOf(PAGE_ROWS / 10, 10), 1000)
        const { data } = await getDefaultAppliedDays(supabase, '2026-12-01', '2027-03-31')
        expect(data?.size).toBe(PAGE_ROWS / 10)
        expect(requestCount()).toBe(1)
    })

    it('PAGE_ROWS を超えるときはページを分けて全部読む', async () => {
        const { supabase, requestCount } = fakeSupabase(rowsOf(21, 100), 1000)
        const { data } = await getDefaultAppliedDays(supabase, '2026-12-01', '2026-12-21')
        expect(data?.size).toBe(21)
        expect(requestCount()).toBe(3)
    })

    it('サーバーの max_rows が PAGE_ROWS より小さくても、短い応答を末尾と見誤って取りこぼさない', async () => {
        // 本番の max_rows は config.toml と別の設定。100 行で切られても、総数に届くまで読み続ける。
        const { supabase } = fakeSupabase(rowsOf(70, 3), 100)
        const { data } = await getDefaultAppliedDays(supabase, '2026-12-01', '2027-02-28')
        expect(data?.size).toBe(70)
    })

    it('読んでいる間に行が消えて範囲の先が無くなっても(416)、エラーにせずそこまでの分で終える', async () => {
        // 210 行を 100 行ずつ読む。最初のページのあとで総数が 70 行に減り、offset=100 は範囲の外になる。
        const { supabase } = fakeSupabase(rowsOf(70, 3), 100, undefined, (n, keys) => {
            if (n === 1) keys.length = 70
        })
        const { data, error } = await getDefaultAppliedDays(supabase, '2026-12-01', '2027-02-28')
        expect(error).toBeNull()
        // 最初の 100 行は 1 日 3 行の 34 日分(34 日目は 1 行だけ)。
        expect(data?.size).toBe(34)
    })

    it('途中の問い合わせが失敗したら、それまでの分を返さずエラーを返す', async () => {
        const { supabase } = fakeSupabase(rowsOf(21, 100), 1000, 2)
        const { data, error } = await getDefaultAppliedDays(supabase, '2026-12-01', '2026-12-21')
        expect(data).toBeNull()
        expect(error).not.toBeNull()
    })
})
