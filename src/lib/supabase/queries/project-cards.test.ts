import { describe, expect, it } from 'vitest'
import { getProjectCards, type ProjectCardRow } from './project-cards'
import { createSupabaseQueryStub } from './test-support'

describe('getProjectCards', () => {
    it('sort_order と slug の昇順で project_cards を取得する', async () => {
        const response = {
            data: [{
                slug: 'monocore',
                sort_order: 1,
                title: 'Monocore',
                status: 'active',
                goal_slug: null,
                deadline: null,
                deadline_note: null,
                definition_of_done: '',
                your_turn: '',
                decisions: [],
                ai_recent: [],
                ai_next: [],
                created_at: null,
                updated_at: null,
            }] satisfies ProjectCardRow[],
            error: null,
        }
        const { supabase, query } = createSupabaseQueryStub(
            'project_cards',
            ['select', 'neq', 'order', 'order'],
            response,
        )

        await expect(getProjectCards(supabase)).resolves.toEqual(response)

        expect(supabase.from).toHaveBeenCalledWith('project_cards')
        expect(query.select).toHaveBeenCalledWith('*')
        expect(query.neq).toHaveBeenCalledWith('status', 'done')
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

    it('カードがない場合も同じ取得クエリを実行する', async () => {
        const response = {
            data: [] satisfies ProjectCardRow[],
            error: null,
        }
        const { supabase, query } = createSupabaseQueryStub(
            'project_cards',
            ['select', 'neq', 'order', 'order'],
            response,
        )

        await expect(getProjectCards(supabase)).resolves.toEqual(response)

        expect(supabase.from).toHaveBeenCalledWith('project_cards')
        expect(query.select).toHaveBeenCalledWith('*')
        expect(query.neq).toHaveBeenCalledWith('status', 'done')
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
                message: 'cards を取得できません',
                details: '',
                hint: '',
                code: '42501',
            },
        }
        const { supabase, query } = createSupabaseQueryStub(
            'project_cards',
            ['select', 'neq', 'order', 'order'],
            response,
        )

        await expect(getProjectCards(supabase)).resolves.toEqual(response)

        expect(supabase.from).toHaveBeenCalledWith('project_cards')
        expect(query.select).toHaveBeenCalledWith('*')
        expect(query.neq).toHaveBeenCalledWith('status', 'done')
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

    it('done ステータスのカードは取得対象から除外する（アクセス経路自体をなくす対象のため）', async () => {
        const response = {
            data: [] satisfies ProjectCardRow[],
            error: null,
        }
        const { supabase, query } = createSupabaseQueryStub(
            'project_cards',
            ['select', 'neq', 'order', 'order'],
            response,
        )

        await getProjectCards(supabase)

        expect(query.neq).toHaveBeenCalledWith('status', 'done')
    })
})
