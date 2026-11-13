import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearWeatherCache, FRESH_MS, readWeatherCache, weatherCacheKey, writeWeatherCache } from './cache'
import type { OpenMeteoForecast } from './forecast'

const forecast = { hourly: { time: ['2026-11-13T00:00'] }, daily: { time: ['2026-11-13', '2026-11-14'] } } as unknown as OpenMeteoForecast
const key = weatherCacheKey(35.68, 139.76, 'Asia/Tokyo')
const NOW = 1_000_000_000_000

beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('window', {
        localStorage: {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => void store.set(k, v),
            removeItem: (k: string) => void store.delete(k),
        },
    })
})

describe('readWeatherCache', () => {
    it('FRESH_MS 以内なら新しい、それより古ければ古いとして返す', () => {
        writeWeatherCache(key, forecast, NOW)
        expect(readWeatherCache(key, '2026-11-13', NOW + FRESH_MS - 1)?.isFresh).toBe(true)
        expect(readWeatherCache(key, '2026-11-13', NOW + FRESH_MS)?.isFresh).toBe(false)
    })

    it('地点・timezone が違う、今日を含まない、取得時刻が未来のものは使わない', () => {
        writeWeatherCache(key, forecast, NOW)
        expect(readWeatherCache(weatherCacheKey(1, 2, 'Asia/Tokyo'), '2026-11-13', NOW)).toBeNull()
        expect(readWeatherCache(key, '2026-11-15', NOW)).toBeNull()
        expect(readWeatherCache(key, '2026-11-13', NOW - 1)).toBeNull()
    })

    it('壊れた値や空は null、clear で消える', () => {
        expect(readWeatherCache(key, '2026-11-13', NOW)).toBeNull()
        window.localStorage.setItem('monocore:weather-cache', '{broken')
        expect(readWeatherCache(key, '2026-11-13', NOW)).toBeNull()
        writeWeatherCache(key, forecast, NOW)
        clearWeatherCache()
        expect(readWeatherCache(key, '2026-11-13', NOW)).toBeNull()
    })
})
