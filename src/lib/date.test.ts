import { describe, it, expect } from 'vitest'
import { localTimeToUtc, utcToLocalTime } from './date'

describe('localTimeToUtc', () => {
    it('converts JST wall time to UTC', () => {
        expect(localTimeToUtc('2026-03-15', '0930', 'Asia/Tokyo')).toBe(
            '2026-03-15T00:30:00.000Z'
        )
    })

    it('converts 24:00 to next day 00:00 (end of day)', () => {
        expect(localTimeToUtc('2026-03-15', '2400', 'Asia/Tokyo')).toBe(
            '2026-03-15T15:00:00.000Z'
        )
    })
})

describe('utcToLocalTime', () => {
    it('round-trips with localTimeToUtc', () => {
        const date = '2026-03-15'
        const hhmm = '1830'
        const tz = 'Asia/Tokyo'
        const utc = localTimeToUtc(date, hhmm, tz)
        expect(utcToLocalTime(utc, tz)).toEqual({ date, hhmm })
    })
})
