import { describe, expect, it } from 'vitest'
import {
    getProjectNotes,
    insertProjectNote,
    latestNoteByCard,
    type ProjectNoteRow,
} from './project-notes'
import { createSupabaseQueryStub } from './test-support'

describe('getProjectNotes', () => {
    it('作成日時の降順で project_notes を取得する', async () => {
        const response = {
            data: [{
                id: 'note-1',
                card_slug: 'monocore',
                body: 'メモ',
                consumed_at: null,
                created_at: '2026-08-09T00:00:00.000Z',
            }] satisfies ProjectNoteRow[],
            error: null,
        }
        const { supabase, query } = createSupabaseQueryStub(
            'project_notes',
            ['select', 'order'],
            response,
        )

        await expect(getProjectNotes(supabase)).resolves.toEqual(response)

        expect(supabase.from).toHaveBeenCalledWith('project_notes')
        expect(query.select).toHaveBeenCalledWith('*')
        expect(query.order).toHaveBeenCalledWith(
            'created_at',
            { ascending: false },
        )
    })

    it('空結果でも作成日時の降順で取得する', async () => {
        const response = {
            data: [] satisfies ProjectNoteRow[],
            error: null,
        }
        const { supabase, query } = createSupabaseQueryStub(
            'project_notes',
            ['select', 'order'],
            response,
        )

        await expect(getProjectNotes(supabase)).resolves.toEqual(response)

        expect(supabase.from).toHaveBeenCalledWith('project_notes')
        expect(query.select).toHaveBeenCalledWith('*')
        expect(query.order).toHaveBeenCalledWith(
            'created_at',
            { ascending: false },
        )
    })

    it('取得エラー時も作成日時の降順で取得する', async () => {
        const response = {
            data: null,
            error: {
                message: 'notes を取得できません',
                details: '',
                hint: '',
                code: '42501',
            },
        }
        const { supabase, query } = createSupabaseQueryStub(
            'project_notes',
            ['select', 'order'],
            response,
        )

        await expect(getProjectNotes(supabase)).resolves.toEqual(response)

        expect(supabase.from).toHaveBeenCalledWith('project_notes')
        expect(query.select).toHaveBeenCalledWith('*')
        expect(query.order).toHaveBeenCalledWith(
            'created_at',
            { ascending: false },
        )
    })
})

describe('insertProjectNote', () => {
    it('カードに紐付かない空本文のメモも単一行として作成する', async () => {
        const response = {
            data: {
                id: 'note-1',
                card_slug: null,
                body: '',
                consumed_at: null,
                created_at: '2026-08-09T00:00:00.000Z',
            } satisfies ProjectNoteRow,
            error: null,
        }
        const { supabase, query } = createSupabaseQueryStub(
            'project_notes',
            ['insert', 'select', 'single'],
            response,
        )

        await expect(
            insertProjectNote(supabase, { card_slug: null, body: '' }),
        ).resolves.toEqual(response)

        expect(supabase.from).toHaveBeenCalledWith('project_notes')
        expect(query.insert).toHaveBeenCalledWith({
            card_slug: null,
            body: '',
        })
        expect(query.select).toHaveBeenCalledWith('*')
        expect(query.single).toHaveBeenCalledWith()
    })

    it('作成エラー時も指定したカードと本文を単一行として作成する', async () => {
        const error = {
            message: 'note を保存できません',
            details: '',
            hint: '',
            code: '42501',
        }
        const response = { data: null, error }
        const { supabase, query } = createSupabaseQueryStub(
            'project_notes',
            ['insert', 'select', 'single'],
            response,
        )

        await expect(
            insertProjectNote(supabase, {
                card_slug: 'monocore',
                body: '内容',
            }),
        ).resolves.toEqual(response)

        expect(supabase.from).toHaveBeenCalledWith('project_notes')
        expect(query.insert).toHaveBeenCalledWith({
            card_slug: 'monocore',
            body: '内容',
        })
        expect(query.select).toHaveBeenCalledWith('*')
        expect(query.single).toHaveBeenCalledWith()
    })
})

describe('latestNoteByCard', () => {
    it('入力順にかかわらずカード別の最新メモを選び、null のカードキーも保持する', () => {
        const notes = [{
            id: 'new',
            card_slug: 'card-a',
            body: '新しい',
            consumed_at: null,
            created_at: '2026-08-03T00:00:00.000Z',
        }, {
            id: 'board',
            card_slug: null,
            body: '全体',
            consumed_at: null,
            created_at: '2026-08-02T00:00:00.000Z',
        }, {
            id: 'old',
            card_slug: 'card-a',
            body: '古い',
            consumed_at: null,
            created_at: '2026-08-01T00:00:00.000Z',
        }] satisfies ProjectNoteRow[]

        const result = latestNoteByCard(notes)

        expect(result.get('card-a')?.id).toBe('new')
        expect(result.get(null)?.id).toBe('board')
    })

    it('空配列には空の Map を返す', () => {
        expect(latestNoteByCard([])).toEqual(new Map())
    })
})
