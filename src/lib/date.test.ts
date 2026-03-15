import { describe, it, expect } from 'vitest'
import { localTimeToUtc, utcToLocalTime } from './date'

describe('localTimeToUtc', () => {
    it('converts 09:30 JST to UTC', () => {
        const utc = localTimeToUtc('2026-03-15', '0930', 'Asia/Tokyo')
        expect(utc).toBe('2026-03-15T00:30:00.000Z') // 09:30 JST = 00:30 UTC
    })

    it('converts 00:00 in UTC to same day UTC', () => {
        const utc = localTimeToUtc('2026-03-15', '0000', 'UTC')
        expect(utc).toBe('2026-03-15T00:00:00.000Z')
    })

    it('converts 24:00 to next day 00:00 (end of day)', () => {
        const utc = localTimeToUtc('2026-03-15', '2400', 'Asia/Tokyo')
        expect(utc).toBe('2026-03-15T15:00:00.000Z') // 2026-03-16 00:00 JST = 2026-03-15 15:00 UTC
    })

    it('converts 23:30 JST to same day UTC', () => {
        const utc = localTimeToUtc('2026-03-15', '2330', 'Asia/Tokyo')
        expect(utc).toBe('2026-03-15T14:30:00.000Z') // 23:30 JST = 14:30 UTC
    })

    it('converts 12:00 America/New_York (EDT) to UTC', () => {
        const utc = localTimeToUtc('2026-06-01', '1200', 'America/New_York')
        expect(utc).toBe('2026-06-01T16:00:00.000Z') // 12:00 EDT = 16:00 UTC
    })

    it('converts 14:00 Europe/London (GMT) to UTC', () => {
        const utc = localTimeToUtc('2026-03-15', '1400', 'Europe/London')
        expect(utc).toBe('2026-03-15T14:00:00.000Z') // 14:00 GMT = 14:00 UTC
    })

    it('converts 09:00 America/Los_Angeles (PDT) to UTC', () => {
        const utc = localTimeToUtc('2026-07-01', '0900', 'America/Los_Angeles')
        expect(utc).toBe('2026-07-01T16:00:00.000Z') // 09:00 PDT = 16:00 UTC
    })
})

describe('utcToLocalTime', () => {
    it('converts UTC to Asia/Tokyo', () => {
        const r = utcToLocalTime('2026-03-15T00:30:00.000Z', 'Asia/Tokyo')
        expect(r).toEqual({ date: '2026-03-15', hhmm: '0930' })
    })

    it('converts UTC to America/New_York (EDT)', () => {
        const r = utcToLocalTime('2026-06-01T16:00:00.000Z', 'America/New_York')
        expect(r).toEqual({ date: '2026-06-01', hhmm: '1200' })
    })

    it('round-trips with localTimeToUtc', () => {
        const date = '2026-03-15'
        const hhmm = '1830'
        const tz = 'Europe/London'
        const utc = localTimeToUtc(date, hhmm, tz)
        const back = utcToLocalTime(utc, tz)
        expect(back).toEqual({ date, hhmm })
    })
})
