import { describe, expect, it } from 'vitest'
import {
    buildWeatherDays,
    describeWeather,
    formatDayHeading,
    windDirectionLabel,
    type OpenMeteoForecast,
    type WeatherDay,
    type WeatherHourRow,
} from './forecast'

function forecast(dates: string[]): OpenMeteoForecast {
    const time = dates.flatMap((d) => Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, '0')}:00`))
    const fill = (v: number) => time.map(() => v)
    return {
        hourly: {
            time,
            weather_code: fill(0),
            temperature_2m: fill(15),
            precipitation_probability: fill(0),
            precipitation: fill(0),
            snowfall: fill(0),
            relative_humidity_2m: fill(50),
            wind_speed_10m: fill(2),
            wind_direction_10m: fill(0),
        },
        daily: {
            time: dates,
            sunrise: dates.map((d) => `${d}T05:58`),
            sunset: dates.map((d) => `${d}T16:50`),
        },
    }
}

const hours = (rows: WeatherDay['rows']) => rows.filter((r): r is WeatherHourRow => r.kind === 'hour')

describe('buildWeatherDays', () => {
    it('今の時刻の行から始め、日ごとに分ける', () => {
        const days = buildWeatherDays(forecast(['2026-10-27', '2026-10-28']), '2026-10-27', 21)
        expect(days.map((d) => d.date)).toEqual(['2026-10-27', '2026-10-28'])
        expect(hours(days[0].rows).map((r) => r.hour)).toEqual([21, 22, 23])
        expect(hours(days[1].rows)).toHaveLength(24)
        expect(hours(days[0].rows)[0].isCurrent).toBe(true)
        expect(hours(days[1].rows).some((r) => r.isCurrent)).toBe(false)
    })

    it('日の出・日の入りは、その時刻を含む行の直後に入る', () => {
        const [, tomorrow] = buildWeatherDays(forecast(['2026-10-27', '2026-10-28']), '2026-10-27', 21)
        const i = tomorrow.rows.findIndex((r) => r.kind === 'sunrise')
        expect(tomorrow.rows[i]).toEqual({ kind: 'sunrise', time: '5:58' })
        expect(tomorrow.rows[i - 1]).toMatchObject({ kind: 'hour', hour: 5 })
        const j = tomorrow.rows.findIndex((r) => r.kind === 'sunset')
        expect(tomorrow.rows[j]).toEqual({ kind: 'sunset', time: '16:50' })
        expect(tomorrow.rows[j - 1]).toMatchObject({ kind: 'hour', hour: 16 })
    })

    it('過ぎた日の出・日の入りは出さない', () => {
        const [today] = buildWeatherDays(forecast(['2026-10-27', '2026-10-28']), '2026-10-27', 21)
        expect(today.rows.some((r) => r.kind !== 'hour')).toBe(false)
    })

    it('行の始まりが日の出前か日の入り後なら夜', () => {
        const [today] = buildWeatherDays(forecast(['2026-10-27']), '2026-10-27', 0)
        const night = Object.fromEntries(hours(today.rows).map((r) => [r.hour, r.isNight]))
        expect([night[5], night[6], night[16], night[17]]).toEqual([true, false, false, true])
    })
})

describe('describeWeather', () => {
    it('WMO コードを日本語にする', () => {
        expect(describeWeather(0)).toEqual({ kind: 'clear', label: '晴れ' })
        expect(describeWeather(63).label).toBe('雨')
        expect(describeWeather(75)).toEqual({ kind: 'snow', label: '大雪' })
        expect(describeWeather(null).kind).toBe('unknown')
        expect(describeWeather(4).kind).toBe('unknown')
    })
})

describe('windDirectionLabel', () => {
    it('16方位に丸める', () => {
        expect(windDirectionLabel(0)).toBe('北')
        expect(windDirectionLabel(360)).toBe('北')
        expect(windDirectionLabel(3)).toBe('北')
        expect(windDirectionLabel(337)).toBe('北北西')
        expect(windDirectionLabel(263)).toBe('西')
        expect(windDirectionLabel(225)).toBe('南西')
    })
})

describe('formatDayHeading', () => {
    it('曜日を付ける', () => {
        expect(formatDayHeading('2026-10-27')).toBe('2026年10月27日(火)')
        expect(formatDayHeading('2026-10-28')).toBe('2026年10月28日(水)')
    })
})
