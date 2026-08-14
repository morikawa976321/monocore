import { describe, expect, it } from 'vitest'
import { isDevAuthBypassEnabled } from './dev-bypass'

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
