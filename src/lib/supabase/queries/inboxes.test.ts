import { describe, expect, it } from 'vitest'
import type { Database } from '../../../types/database.types'
import { getInbox, upsertInbox } from './inboxes'
import { createSupabaseQueryStub } from './test-support'

type InboxRow = Database['public']['Tables']['inboxes']['Row']

describe('getInbox', () => {
    it('inboxes の単一レコードを取得する', async () => {
        const response = {
            data: {
                user_id: 'user-1',
                content: '確認する',
                created_at: null,
                updated_at: null,
            } satisfies InboxRow,
            error: null,
        }
        const { supabase, query } = createSupabaseQueryStub(
            'inboxes',
            ['select', 'maybeSingle'],
            response,
        )

        await expect(getInbox(supabase)).resolves.toEqual(response)

        expect(supabase.from).toHaveBeenCalledWith('inboxes')
        expect(query.select).toHaveBeenCalledWith('*')
        expect(query.maybeSingle).toHaveBeenCalledWith()
    })

    it('レコードがない場合も maybeSingle で取得する', async () => {
        const response = { data: null, error: null }
        const { supabase, query } = createSupabaseQueryStub(
            'inboxes',
            ['select', 'maybeSingle'],
            response,
        )

        await expect(getInbox(supabase)).resolves.toEqual(response)

        expect(supabase.from).toHaveBeenCalledWith('inboxes')
        expect(query.select).toHaveBeenCalledWith('*')
        expect(query.maybeSingle).toHaveBeenCalledWith()
    })

    it('取得エラー時も maybeSingle で取得する', async () => {
        const error = new Error('inbox を取得できません')
        const response = { data: null, error }
        const { supabase, query } = createSupabaseQueryStub(
            'inboxes',
            ['select', 'maybeSingle'],
            response,
        )

        await expect(getInbox(supabase)).resolves.toEqual(response)

        expect(supabase.from).toHaveBeenCalledWith('inboxes')
        expect(query.select).toHaveBeenCalledWith('*')
        expect(query.maybeSingle).toHaveBeenCalledWith()
    })
})

describe('upsertInbox', () => {
    it('空文字を含む内容を user_id の競合キーで upsert する', async () => {
        const response = { error: null }
        const { supabase, query } = createSupabaseQueryStub(
            'inboxes',
            ['upsert'],
            response,
        )

        await expect(upsertInbox(supabase, '')).resolves.toEqual(response)

        expect(supabase.from).toHaveBeenCalledWith('inboxes')
        expect(query.upsert).toHaveBeenCalledWith(
            { content: '' },
            { onConflict: 'user_id' },
        )
    })

    it('upsert エラー時も指定内容と競合キーで保存する', async () => {
        const error = new Error('inbox を保存できません')
        const response = { error }
        const { supabase, query } = createSupabaseQueryStub(
            'inboxes',
            ['upsert'],
            response,
        )

        await expect(
            upsertInbox(supabase, '更新内容'),
        ).resolves.toEqual(response)

        expect(supabase.from).toHaveBeenCalledWith('inboxes')
        expect(query.upsert).toHaveBeenCalledWith(
            { content: '更新内容' },
            { onConflict: 'user_id' },
        )
    })
})
