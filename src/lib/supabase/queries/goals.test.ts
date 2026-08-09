import { describe, expect, it } from 'vitest'
import { getGoals, type GoalRow } from './goals'
import { createSupabaseQueryStub } from './test-support'

describe('getGoals', () => {
    it('sort_order と slug の昇順で goals を取得する', async () => {
        const response = {
            data: [{
                slug: 'health',
                sort_order: 1,
                title: '健康',
                created_at: null,
                updated_at: null,
            }] satisfies GoalRow[],
            error: null,
        }
        const { supabase, query } = createSupabaseQueryStub(
            'goals',
            ['select', 'order', 'order'],
            response,
        )

        await expect(getGoals(supabase)).resolves.toEqual(response)

        expect(supabase.from).toHaveBeenCalledWith('goals')
        expect(query.select).toHaveBeenCalledWith('*')
        expect(query.order).toHaveBeenNthCalledWith(
            1,
            'sort_order',
            { ascending: true },
        )
        expect(query.order).toHaveBeenNthCalledWith(
            2,
            'slug',
            { ascending: true },
        )
    })

    it('空の goals 一覧でも同じ取得クエリを実行する', async () => {
        const response = {
            data: [] satisfies GoalRow[],
            error: null,
        }
        const { supabase, query } = createSupabaseQueryStub(
            'goals',
            ['select', 'order', 'order'],
            response,
        )

        await expect(getGoals(supabase)).resolves.toEqual(response)

        expect(supabase.from).toHaveBeenCalledWith('goals')
        expect(query.select).toHaveBeenCalledWith('*')
        expect(query.order).toHaveBeenNthCalledWith(
            1,
            'sort_order',
            { ascending: true },
        )
        expect(query.order).toHaveBeenNthCalledWith(
            2,
            'slug',
            { ascending: true },
        )
    })

    it('取得エラー時も同じ取得クエリを実行する', async () => {
        const response = {
            data: null,
            error: {
                message: 'goals を取得できません',
                details: '',
                hint: '',
                code: '42501',
            },
        }
        const { supabase, query } = createSupabaseQueryStub(
            'goals',
            ['select', 'order', 'order'],
            response,
        )

        await expect(getGoals(supabase)).resolves.toEqual(response)

        expect(supabase.from).toHaveBeenCalledWith('goals')
        expect(query.select).toHaveBeenCalledWith('*')
        expect(query.order).toHaveBeenNthCalledWith(
            1,
            'sort_order',
            { ascending: true },
        )
        expect(query.order).toHaveBeenNthCalledWith(
            2,
            'slug',
            { ascending: true },
        )
    })
})
