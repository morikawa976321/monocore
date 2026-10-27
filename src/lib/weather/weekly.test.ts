import { describe, expect, it } from 'vitest'
import type { OpenMeteoForecast } from './forecast'
import { buildWeeklyDays, dayWeatherOf, phraseOfDay } from './weekly'

/** 0〜23時の天気コード。morning は6〜11時、afternoon は12〜17時、残りは夜 */
function day(morning: number[], afternoon: number[], night = 0): number[] {
    return [...Array(6).fill(night), ...morning, ...afternoon, ...Array(6).fill(night)]
}

describe('dayWeatherOf', () => {
    it('WMO コードを晴・曇・雨・雪に丸める', () => {
        expect([0, 1, 2, 3, 45, 51, 63, 73, 85, 95].map(dayWeatherOf)).toEqual([
            'sun', 'sun', 'sun', 'cloud', 'cloud', 'rain', 'rain', 'snow', 'snow', 'rain',
        ])
    })
})

describe('phraseOfDay', () => {
    it('午前と午後で多い天気が違えば「のち」', () => {
        expect(phraseOfDay(day(Array(6).fill(0), Array(6).fill(3)))).toEqual({ first: 'sun', second: 'cloud', joiner: 'later' })
    })

    it('同じなら、日中に別の天気が2時間以上あるときだけ「時々」', () => {
        expect(phraseOfDay(day([3, 3, 3, 0, 3, 3], [3, 0, 3, 3, 3, 3]))).toEqual({ first: 'cloud', second: 'sun', joiner: 'sometimes' })
        expect(phraseOfDay(day([3, 3, 3, 0, 3, 3], [3, 3, 3, 3, 3, 3]))).toEqual({ first: 'cloud', second: null, joiner: null })
    })

    it('夜の天気は言い方に入れない', () => {
        expect(phraseOfDay(day(Array(6).fill(0), Array(6).fill(0), 63))).toEqual({ first: 'sun', second: null, joiner: null })
    })

    it('時間数が同じなら悪い方を取る', () => {
        expect(phraseOfDay(day([0, 0, 0, 63, 63, 63], [63, 63, 63, 63, 63, 63]))?.first).toBe('rain')
    })

    it('天気コードが無ければ null', () => {
        expect(phraseOfDay(Array(24).fill(null))).toBeNull()
    })
})

describe('buildWeeklyDays', () => {
    const dates = ['2026-11-02', '2026-11-03', '2026-11-04']
    const forecast: OpenMeteoForecast = {
        hourly: {
            time: dates.flatMap((d) => Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, '0')}:00`)),
            weather_code: [...day(Array(6).fill(0), Array(6).fill(63)), ...Array(48).fill(0)],
            temperature_2m: [],
            precipitation_probability: [],
            precipitation: [],
            snowfall: [],
            relative_humidity_2m: [],
            wind_speed_10m: [],
            wind_direction_10m: [],
        },
        daily: {
            time: dates,
            sunrise: [],
            sunset: [],
            temperature_2m_max: [20.6, 21.3, 15.6],
            temperature_2m_min: [11.4, 12, 11.6],
            precipitation_probability_max: [37, 26, 24],
            precipitation_sum: [0.3, 1, 2],
        },
    }

    it('今日から並べ、曜日・祝日・天気の言い方を付ける', () => {
        const days = buildWeeklyDays(forecast, '2026-11-03')
        expect(days.map((d) => d.date)).toEqual(['2026-11-03', '2026-11-04'])
        expect(days[0]).toMatchObject({ isToday: true, weekday: 2, holiday: '文化の日', temperatureMax: 21.3, precipitation: 1 })
        expect(days[1]).toMatchObject({ isToday: false, weekday: 3, holiday: null })
    })

    it('日ごとに、その日の時間の天気から言い方を作る', () => {
        const [first] = buildWeeklyDays(forecast, '2026-11-02')
        expect(first.phrase).toEqual({ first: 'sun', second: 'rain', joiner: 'later' })
    })
})
