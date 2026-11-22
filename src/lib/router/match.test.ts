import { describe, expect, it } from 'vitest'
import { matchPath } from './match'

describe('matchPath', () => {
    it('固定のパスは完全一致だけ', () => {
        expect(matchPath('/schedules', '/schedules')).toEqual({})
        expect(matchPath('/schedules', '/schedules/x')).toBeNull()
        expect(matchPath('/schedules', '/schedulesx')).toBeNull()
        expect(matchPath('/schedules', '/')).toBeNull()
    })

    it('ルートは / だけに一致する', () => {
        expect(matchPath('/', '/')).toEqual({})
        expect(matchPath('/', '/schedules')).toBeNull()
    })

    it('末尾のスラッシュは無視する', () => {
        expect(matchPath('/reports', '/reports/')).toEqual({})
        expect(matchPath('/reports/:slug', '/reports/a/')).toEqual({ slug: 'a' })
    })

    it(':name は 1 セグメントに一致し、デコードして返す', () => {
        expect(matchPath('/reports/:slug', '/reports/weekly-2026')).toEqual({ slug: 'weekly-2026' })
        expect(matchPath('/reports/:slug', '/reports/%E5%A4%A9%E6%B0%97')).toEqual({ slug: '天気' })
        expect(matchPath('/reports/:slug', '/reports')).toBeNull()
        expect(matchPath('/reports/:slug', '/reports/a/b')).toBeNull()
    })

    it('デコードできない値は一致しない', () => {
        expect(matchPath('/reports/:slug', '/reports/%E0%A4%A')).toBeNull()
    })
})
