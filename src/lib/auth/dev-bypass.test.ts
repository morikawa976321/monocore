import { describe, expect, it } from 'vitest'
import {
    getDevAuthCredentials,
    isDevAuthBypassEnabled,
    isLocalSupabaseUrl,
} from './dev-bypass'

describe('isDevAuthBypassEnabled', () => {
    it('development だけ true', () => {
        expect(isDevAuthBypassEnabled('development')).toBe(true)
        expect(isDevAuthBypassEnabled('production')).toBe(false)
        expect(isDevAuthBypassEnabled('test')).toBe(false)
        expect(isDevAuthBypassEnabled(undefined)).toBe(false)
    })

    it('DEV_AUTH_BYPASS=0/false で development でも無効', () => {
        expect(isDevAuthBypassEnabled('development', '0')).toBe(false)
        expect(isDevAuthBypassEnabled('development', 'false')).toBe(false)
        expect(isDevAuthBypassEnabled('development', '1')).toBe(true)
    })
})

describe('isLocalSupabaseUrl', () => {
    it('127.0.0.1 と localhost だけ true', () => {
        expect(isLocalSupabaseUrl('http://127.0.0.1:54321')).toBe(true)
        expect(isLocalSupabaseUrl('http://localhost:54321')).toBe(true)
        expect(isLocalSupabaseUrl('https://example.supabase.co')).toBe(false)
        expect(isLocalSupabaseUrl(undefined)).toBe(false)
        expect(isLocalSupabaseUrl('not-a-url')).toBe(false)
    })
})

describe('getDevAuthCredentials', () => {
    it('明示した email/password を優先する', () => {
        expect(
            getDevAuthCredentials('http://127.0.0.1:54321', 'me@example.com', 'secret'),
        ).toEqual({ email: 'me@example.com', password: 'secret', canSignUp: false })
    })

    it('ローカル URL なら開発ユーザーを返す', () => {
        expect(getDevAuthCredentials('http://127.0.0.1:54321')).toEqual({
            email: 'dev@localhost',
            password: 'local-dev-password',
            canSignUp: true,
        })
    })

    it('リモート URL で資格情報が無ければ null', () => {
        expect(getDevAuthCredentials('https://example.supabase.co')).toBeNull()
    })
})
